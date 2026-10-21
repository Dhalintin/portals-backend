# Backend fixes and file map

This patch implements the first safety and correctness pass from the review.
It is not a claim that all roadmap features are complete.

The second fix batch now implements persistent sessions, refresh-token rotation,
logout/logout-all revocation and password-reset session invalidation. See
[SESSION_FIX_GUIDE.md](SESSION_FIX_GUIDE.md) for code changes, frontend behavior
and the required session migration. The first-batch details below are retained.

The third batch adds guarded two-school seeds and real PostgreSQL integration
and migration-replay checks, and fixes calendar concurrency. See
[POSTGRES_FIX_GUIDE.md](POSTGRES_FIX_GUIDE.md) for commands, coverage and limits.

The fourth batch adds the onboarding checklist, fee structure editing, unpaid
invoice cancellation and invoice batch idempotency. See
[FEES_ONBOARDING_FIX_GUIDE.md](FEES_ONBOARDING_FIX_GUIDE.md) for the migration,
frontend request change, endpoints and remaining work.

The fifth batch adds unpaid invoice corrections, manual payment idempotency,
audited manual accounting reversals, void receipts and closed-payment protection.
See [PAYMENT_LIFECYCLE_FIX_GUIDE.md](PAYMENT_LIFECYCLE_FIX_GUIDE.md) for API changes,
the migration and remaining finance work.

The sixth batch replaces administrator-chosen invitation passwords with
expiring acceptance tokens and adds SMTP/Resend authentication email delivery.
See [INVITATION_DELIVERY_FIX_GUIDE.md](INVITATION_DELIVERY_FIX_GUIDE.md) for
dependencies, environment setup, worker operation, API changes and limits.

The seventh batch fixes the dependency audit findings and switches development
watching to Node's native watch mode. See
[DEPENDENCY_SECURITY_FIX_GUIDE.md](DEPENDENCY_SECURITY_FIX_GUIDE.md) for the
patched versions, scoped Prisma tooling overrides, verification and limits.

## Code already updated

### 1. Tenant, parent and teacher access

| File | Change |
| --- | --- |
| `src/middlewares/authenticate.ts` | Check the current user, membership and school in the database on every authenticated request. Recompute permissions from the current role rather than stale JWT claims. Supplied invalid optional credentials are rejected. |
| `src/middlewares/requireStaff.ts` (new) | Prevent parent memberships from entering general staff APIs. |
| `src/auth/resourceAccess.ts` (new) | Shared parent-child ownership checks, teacher class/subject assignment checks and teacher read filters. |
| `src/features/results/results.routes.ts` | Mount parent routes before staff guards; restrict grade-scale changes to settings permission and ranking to publishing permission. |
| `src/features/results/results.controller.ts` | Enforce teacher access for sheet creation and approval/publish authority; expose a parent report-card endpoint with child ownership and publication checks. |
| `src/features/results/results.service.ts` | Check subject curriculum/assignment on writes and apply teacher class filters on reads. |
| `src/features/attendance/attendance.routes.ts` | Separate parent history from staff APIs. |
| `src/features/attendance/attendance.controller.ts` | Check child ownership on parent history and pass teacher context to staff reads. |
| `src/features/attendance/attendance.service.ts` | Validate school/class/student relationships during sync; school-scope the fallback lookup; reject client keys reused for different records; enforce teacher assignments and read filters. |
| `src/features/fees/fees.routes.ts` | Keep the child-scoped parent fees endpoint; guard general fee/invoice/receipt endpoints as staff APIs. |
| `src/features/dashboard/dashboard.routes.ts` | Prevent parent access to staff dashboards and staff report-data endpoints. |
| `src/features/dashboard/dashboard.controller.ts`, `dashboard.service.ts` | Pass teacher context through report-card reads to prevent an alternate-route bypass. |
| `src/features/students/students.controller.ts`, `students.service.ts` | Apply assigned-class filters to teacher student reads/exports. |

Parent frontend endpoints (all require a valid school token):

```text
GET /api/v1/results/parent/me
GET /api/v1/results/parent/report-cards/:id
GET /api/v1/fees/parent/me
GET /api/v1/attendance/parent/students/:studentId?from=2026-10-01&to=2026-10-31
```

The general result/fee/attendance/dashboard endpoints now return 403 to parent
memberships. A parent must have an active Parent profile and linked children.
A class teacher can read their assigned class; entering a subject's scores
requires that specific subject assignment.

### 2. Validation and configuration

| File | Change |
| --- | --- |
| `src/middlewares/validate.ts` | Install parsed values onto the request, including Express 5 query values, so existing controllers use defaults/coercions/transforms. Also retain separate parsed body/query/params in `res.locals.validatedBySource`. |
| `src/config/env.ts` | Derive production mode from `NODE_ENV`; default access-token expiration to 15 minutes; configure explicit CORS origins. |
| `src/middlewares/index.middleware.ts` | Mount request IDs and security headers early, use explicit CORS origins, limit JSON/urlencoded bodies to 2 MB, mount a 1 MB raw webhook route before JSON parsing. |
| `src/features/appRoutes.ts` | Remove the old webhook mount after JSON parsing. |
| `src/features/students/student.routes.ts` | Remove logging of the full student import/create request body. |
| `src/server.ts` | Use the validated port setting and handle SIGTERM/SIGINT with a bounded shutdown and Prisma disconnect. |

Set these explicitly in your local/deployment environment (do not copy secret
values into source control):

```dotenv
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CORS_ORIGINS=http://localhost:3000
PORT=4000
```

`CORS_ORIGINS` accepts comma-separated exact frontend origins. Add your actual
school frontend origins and ports. A default only applies if the environment
variable is absent; an existing `JWT_ACCESS_EXPIRES=7d` still overrides the new
default. `PORT` now consistently uses the config default of 4000, rather than
the server's previous fallback of 9871.

### 3. Result correctness

`src/features/results/results.service.ts` now merges omitted CA/exam values
with the existing score before recomputing the total. Explicit null clears a
component to zero. CA + exam totals above 100 are rejected. Editing requires
DRAFT status, and the status is rechecked in the transaction.

Grade bands must cover whole-mark ranges from 0 through 100 continuously.
Decimal scores are classified by their completed whole mark: 69.5 is B under
the default scale, while 70 is A. The stored total remains 69.5; only grading
uses the whole mark. Assessment component weights remain a future per-school
configuration decision; this patch enforces the total limit only.

Approval/publication requires `results:publish` in both the controller and
transition service. Conditional status updates reject a concurrent change.

### 4. Fees, payment allocation and Paystack

| File | Change |
| --- | --- |
| `src/lib/schoolTransaction.ts` (new) | Transaction-scoped PostgreSQL advisory lock serializes cooperating writers for one school. Locks release on commit/rollback; external Paystack calls stay outside the transaction. |
| `src/features/fees/fees.service.ts` | Validate fee categories/calendar/class relationships, save the structure's class ID, filter invoice recipients by class, reject foreign-school student IDs, serialize financial writes and allocate only positive amounts to non-cancelled invoices. |
| Same service | Generate invoice/receipt sequences from the maximum numeric suffix while holding the school lock, avoiding timestamp ties and concurrent numbering collisions. |
| Same service | Keep server-selected invoice/student metadata authoritative; validate payment student/invoice relationships; reject amount/currency/reference mismatches; keep pending provider responses pending; recheck successful status after acquiring the lock. |
| `src/lib/paystack.ts` | Check provider configuration, validate signature shape, compare signatures in constant time, bound provider request time, and include verification currency. |
| `src/features/fees/fees.controller.ts` | Require the original webhook bytes; do not reconstruct JSON for signature verification. |
| `src/features/students/students.service.ts` | Recheck student capacity inside the same school lock used for student creation. |
| `src/features/imports/imports.service.ts` | Validate imported enrollment session ownership and recheck import capacity inside the school transaction. |
| `prisma/schema.prisma` | Unique provider references and school/client-key attendance pairs. |
| `prisma/migrations/20261013095000_payment_and_attendance_uniqueness/migration.sql` (new) | Add the matching unique indexes without deleting existing data. |

The lock is a simple V1 concurrency strategy. All future writes affecting
these balances/caps must use the same locking convention. It does not repair
existing inconsistent data, make invoice-generation retries idempotent, or
replace database integration tests. Large imports may need chunked processing
instead of the transaction's 30-second timeout.

### 5. Notification isolation

`src/features/communication/communication.controller.ts` passes the school ID
to `processOutbox`. `communication.service.ts` filters the queue to that school.
The current provider stub reports `simulated: true` and leaves messages PENDING;
it no longer falsely records successful delivery.

### 6. Verification and development scripts

- `tests/regression.test.cjs` (new): regression coverage with explicit Prisma and
  Paystack test doubles, including actual local HTTP route/parser tests.
- `package.json`: `npm test` validates the Prisma schema, compiles into
  `.test-build`, and runs Node's built-in test runner. `npm run dev` runs the
  compiled JavaScript server with Node's native watch mode. This avoids the
  ts-node-dev/TypeScript 7 compiler API incompatibility.
- `.gitignore`: ignores `.test-build`.

```powershell
npm test
npm run build
npm run tsc
```

Keep the compiler watcher running, then open a second terminal:

```powershell
npm run dev
```

Schema validation reads Prisma configuration but does not connect to or change
the database. Regression tests do not use production credentials or make real
database/Paystack calls. Database locking, migration deployment, allocation
under concurrent real requests and provider recovery still require integration
testing against a disposable PostgreSQL database and Paystack test mode.

## Database rollout

Verification completed: Prisma schema validation passed, TypeScript compilation
passed, and all 22 regression tests passed. The database/provider integration
limitations above still apply.

The migration has been prepared, not applied. Inspect duplicates in the target
database before deploying it:

```sql
SELECT "providerReference", COUNT(*)
FROM "Payment"
WHERE "providerReference" IS NOT NULL
GROUP BY "providerReference" HAVING COUNT(*) > 1;

SELECT "organizationId", "clientKey", COUNT(*)
FROM "AttendanceRecord"
WHERE "clientKey" IS NOT NULL
GROUP BY "organizationId", "clientKey" HAVING COUNT(*) > 1;
```

If either query returns rows, reconcile them before deployment; the migration
deliberately fails rather than discarding records. Multiple NULL references or
client keys are allowed by PostgreSQL.

After reviewing existing pending migrations and testing against a disposable
database, the deployment commands are:

```powershell
npx prisma generate
npx prisma migrate deploy
npm run build
```

`migrate deploy` applies every pending migration, not only this new file. Keep
applied migration history; do not delete old PIN migrations to clean up code.

## Remaining work in recommended order

1. **Onboarding:** The minimum student/parent activation checklist is now
   implemented in batch four. Calendar concurrency and current term/session
   alignment were fixed and verified in the third batch.
2. **Fee lifecycle and safe retries:** `src/features/fees/fees.validation.ts`,
   `fees.routes.ts`, `fees.controller.ts`, `fees.service.ts`, schema/migration.
   Batch idempotency, structure updates and unpaid cancellation are implemented.
   Invoice corrections, retry-safe manual payment entry and audited manual
   accounting reversals are implemented in batch five. Provider refunds,
   reconciliation, partial reversals, credit notes and standalone allocation
   retry keys remain. Do not edit
   settled payment amounts to simulate refunds.
3. **Invitations and reset delivery:** `src/features/auth/auth.service.ts`,
   `src/features/memberships/memberships.service.ts`,
   `src/features/parents/parents.service.ts`, schema/migration and a provider
   adapter. Expiring invitations and encrypted reset/invitation delivery are
   implemented in batch six, supporting SMTP and Resend. Configure the selected
   provider, build the frontend acceptance/reset pages and run the worker.
4. **Imports:** `src/features/imports/*`, `src/features/students/*`, a file
   storage/parser adapter. Add bounded Excel parsing, mapping/templates,
   actual XLSX exports and safe spreadsheet-cell handling. Current imports
   accept mapped JSON rows, not uploaded Excel files.
5. **Notification delivery:** `src/features/communication/*` plus a worker,
   `src/features/attendance/attendance.service.ts`,
   `src/features/results/results.service.ts`, `src/features/fees/fees.service.ts`.
   Transactional student events, event keys, queue claims, retries/backoff,
   scheduled announcements and SMTP/Resend delivery are implemented in batches
   eleven and twelve. Configure and supervise the worker, verify parent contacts
   in staging, and add WhatsApp/SMS only if those channels are required.
6. **Identity/policy decisions:** schema, parent/membership services and
   `src/features/platform/platform.service.ts`. Allow per-school parent profiles
   for one user; decide multiple roles per school and whether platform-admin
   assignments restrict school management. These are not changed in this patch.
7. **Cleanup:** remove obsolete PIN and public result-checker code and unused
   old feature implementations after checking imports. Consolidate response,
   auth/error/validation helpers and remove dead dependencies. Existing local
   work and applied migration history should be preserved.

No real email/WhatsApp delivery, live database migration, production deployment
or refund implementation has been performed. Session revocation is now
implemented by the second batch and requires its migration before use.

Batch eight consolidates active teacher routes onto database-backed sessions,
current permissions and pending invitations. Teacher updates no longer edit
shared account profiles, and credentialed CORS uses configured exact origins.
See TEACHER_SESSION_FIX_GUIDE.md for frontend changes. Staffing concurrency is
addressed by batch nine below; imports and notifications remain.

Batch nine addresses staffing concurrency across the active class, teacher,
membership and subject APIs. Curriculum and active-account checks happen under
the shared school lock; deactivation and loss of teaching roles clear staffing.
See STAFFING_CONSISTENCY_FIX_GUIDE.md. Imports and notification delivery are the
next implementation batches, followed by legacy cleanup and staging checks.

Batch ten makes mapped JSON student and parent imports atomic and retry-safe.
Row diagnostics, references, subscription caps, parent grouping and import audit
records are covered by IMPORT_ATOMICITY_FIX_GUIDE.md. Apply the import batch
migration before deploying that version. Excel uploads/exports remain feature
work; general notification delivery is the next fix batch.

Batch eleven adds SMTP/Resend outbox delivery with leases, retry limits and
expiry, and makes scheduled announcement publication, parent email queueing and
auditing atomic. See NOTIFICATION_DELIVERY_FIX_GUIDE.md and its migration.
Automatic attendance/result/payment event wiring remains the next batch.

Batch twelve connects attendance changes, result publication and receipt
issuance to transactional email events, with current parent/child checks,
duplicate suppression, stale-event cancellation and atomic audit records.
See EVENT_NOTIFICATION_FIX_GUIDE.md. Legacy cleanup and staging/deployment
verification are the next steps; optional transports and Excel features remain.

Batch thirteen archives obsolete source and stale compiled modules, adds an
explicit retirement/import guard and compiled npm start entry point, and repairs
the staff POST invitation placeholder. See LEGACY_CLEANUP_FIX_GUIDE.md. Tenant
identity/policy gaps and staging/operational checks remain; no database history
was changed by the cleanup.

Batch fourteen permits one verified parent account to have separate profiles in
multiple schools, with school-scoped uniqueness and child-link filtering. See
PARENT_TENANCY_FIX_GUIDE.md and apply its migration before deployment. Multiple
roles within one school remain a product decision; staging/operational checks
are still required before declaring the backend ready.

Batch fifteen is the MVP/frontend handoff checkpoint. It adds a parent self-view
for linked active children, enables published announcement reads for school
members, closes inactive-announcement filtering bypasses, and returns safe JSON
parser/size errors with browser-readable request IDs. See MVP_FRONTEND_HANDOFF.md
for scope, API contracts, screen order, deferred features and release gates.
The MVP retains one role per account per school and manual payments; optional
features and unresolved delegated platform administration are deferred. No new
dependencies or migration are required by this batch. Staging/provider/restore
verification remains required before a public launch, not before frontend work.

Batch sixteen continues backend MVP acceptance; it supersedes the suggestion
to begin frontend work after batch fifteen. It adds an HTTP fresh-school journey,
database readiness/startup checks, explicit proxy trust and bounded pool settings,
a combined email worker, read-only release configuration checks, Render/Supabase
configuration templates and an isolated backup/restore rehearsal. See
MVP_BACKEND_ACCEPTANCE.md and RENDER_SUPABASE_DEPLOYMENT.md. Hosted verification
remains pending until exercised against actual services; optional scope stays deferred.
