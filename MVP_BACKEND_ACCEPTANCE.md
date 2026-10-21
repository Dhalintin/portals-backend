# MVP backend acceptance report

## Fixed scope

Finish the backend before starting frontend work. The cut is school-owner setup,
people/staffing, teacher attendance/results, manual fee collection, parent views
and email announcements/events. Existing security fixes and tenant isolation
are mandatory. Keep multiple-role accounts, spreadsheet file uploads, extra
message transports, online payments/refunds, automated billing and delegated
platform administration deferred. Do not reopen these as release requirements.

## Evidence and remaining gates

| Area | Local evidence | Hosted gate |
| --- | --- | --- |
| Register and school setup | Fresh school HTTP test; calendar/class/subject setup and onboarding completion | Repeat against staging |
| Staff/parent invitation | Pending invitation and verified acceptance tests; no admin-set password | Verify real sender/domain and mailbox delivery |
| People and access | Current memberships, parent-child links, teacher assignments and two-school tests | Verify Supabase Data API cannot bypass backend |
| Attendance | Mark/sync/history and scoped parent reads | Staging role/access check |
| Results | Draft/submit/approve/publish, teacher approval denial, parent report payload | Staging published/unpublished reads |
| Manual finance | Invoice/payment retry protection, allocations, receipts, corrections/reversals | Staging invoice-to-paid-receipt flow |
| Parent home | Empty, inactive, unlinked and school-scoped overview tests | Staging parent session |
| Communication | SMTP/Resend adapters, queues, retry/leases, scheduled/event delivery, combined worker isolation | Real delivery, quotas and worker restart |
| Sessions | Refresh rotation/reuse, logout/all and reset revocation | Staging token flow |
| Runtime | Liveness/readiness failure handling, bounded connection acquisition, proxy configuration | Render HTTPS/routing/rate-limit verification |
| Schema/recovery | Migration replay/drift and isolated backup/restore rehearsal | Restore an actual hosted backup to a separate target |

The fresh-school acceptance test uses HTTP to register a new school, configure
calendar/curriculum, invite and sign in a teacher and parent, enrol/link a child,
complete onboarding, mark attendance, enter/approve/publish results, generate an
invoice, record a manual payment, verify parent receipt visibility, reject other
school access, refresh and log out. It does not manually insert business rows
for that new school's journey. Test-only encrypted-mail inspection supplies
invitation tokens without sending messages to any real mailbox.

Commands: npm test; npm run test:integration; npm run test:restore;
npm run security:check; npm run build. The restore runner also checks migration
replay and schema drift. npm run release:check validates release configuration
without contacting services.

See RENDER_SUPABASE_DEPLOYMENT.md, RENDER_ENV.example and render.example.yaml for
the user-selected Render/Supabase target and recommended Resend API setup.
Configuration templates are reviewable artifacts; no cloud resources were
created and no live database migration, provider email or payment was performed.

## Completion rule

Local implementation/tests and hosted release acceptance are separate states.
Do not label the backend fully accepted until the hosted gates above are verified.
Record any unavailable account access as pending, rather than silently skipping
it or claiming that documentation proves it works. Frontend work remains deferred
under the user's latest instruction.

## Deployment ownership clarification

The user will create/configure the Render, Supabase and email accounts and perform
hosted setup. The requested deliverable here is backend code and locally verified
acceptance, with reviewable deployment templates. Live delivery, routing and
hosted restore remain owner-run release checks; no account access is required to
complete the code handoff. Frontend work remains outside this code task.

## Final local verification (2026-10-18)

Code-side acceptance for the agreed MVP passed:
- npm test: 60 tests passed.
- npm run test:integration: 88 tests passed, including the full fresh-school HTTP journey.
- npm run test:restore: migrations replayed without drift; all 39 restored public
  tables matched row counts/content fingerprints in an isolated database.
- npm run security:check: zero vulnerabilities.
- npm run build: passed, including production retired-module guards.

No dependency installation or new schema migration is introduced by this batch.
Hosted configuration and live release evidence are owner-run tasks under the
latest instruction. This completes the requested local code acceptance pass;
it does not claim that cloud services have already been configured or verified.

## Code map for this batch

| Files | Change |
| --- | --- |
| src/lib/readiness.ts, src/features/appRoutes.ts | Database-aware readiness alongside liveness |
| src/lib/startServer.ts, src/server.ts | Readiness before listening, explicit IPv4 binding, nonzero startup failure |
| src/config/trustProxy.ts, src/config/env.ts, src/middlewares/index.middleware.ts | Explicit trusted proxy networks and pool configuration |
| src/lib/prisma.ts | Bounded connection acquisition and DB_POOL_MAX |
| src/lib/emailWorkerCycle.ts, src/workers/emailWorker.ts | One service handles both email queues with task failure isolation |
| scripts/release-config.cjs | Read-only configuration checks without printing secrets |
| scripts/run-integration.cjs, scripts/test-database.cjs | Private backup/restore rehearsal and isolated environment defaults |
| tests/postgres.integration.test.cjs, tests/regression.test.cjs, tests/test-runner.test.cjs | MVP journey, readiness/startup, worker, proxy and release-config coverage |
| package.json | email:worker:all, test:restore and release:check commands |
| render.example.yaml, RENDER_ENV.example | Reviewable deployment templates; no cloud services created |

## Current local verification — 21 October 2026

See MVP_LOCAL_ACCEPTANCE_2026-10-21.md. Corrected configured-origin CORS; 88 PostgreSQL integration tests and 64 backend regressions pass. Production build, dependency audit (zero vulnerabilities), migration replay without drift, and 39-table backup/restore comparison pass. Hosted checks remain pending.
