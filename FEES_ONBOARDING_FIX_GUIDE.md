# Fourth fix batch: onboarding and invoice lifecycle

The source now includes the onboarding checklist, fee structure editing,
unpaid invoice cancellation and retry-safe invoice generation. No configured
database was migrated and no real payments or messages were sent.

## Updated files

- `src/features/schools/onboarding.ts`, `schools.service.ts`,
  `schools.controller.ts`, `schools.routes.ts`: checklist and completion.
- `src/features/fees/fees.validation.ts`, `fees.service.ts`,
  `fees.controller.ts`, `fees.routes.ts`: financial endpoints and validation.
- `prisma/schema.prisma` and
  `prisma/migrations/20261013150000_invoice_batches/migration.sql`: school-scoped
  invoice batches and nullable invoice batch references. Existing invoices are
  preserved. Older generation requests cannot be deduplicated retrospectively.
- `tests/regression.test.cjs`, `tests/postgres.integration.test.cjs`: adjusted
  request contract and new database coverage.
- `scripts/run-integration.cjs`: bounded retries for temporarily locked Windows
  files after the private PostgreSQL server has stopped.

## Required local steps

No new dependencies are required. Review the configured database, then apply
pending migrations, regenerate Prisma and rebuild:

```powershell
npx prisma migrate deploy
npx prisma generate
npm run build
```

`migrate deploy` applies every pending migration, including the earlier session
and uniqueness migrations if not already applied. Preserve applied migration
files. The build/dev commands retain the compiled JavaScript workflow;
`npm run tsc` and `npm run dev` can run in separate terminals after building.

## Invoice generation: frontend change required

`POST /api/v1/fees/invoices/generate` requires `idempotencyKey` in the body.
Generate and save one key for each intended billing operation; reuse that key
and request body on timeout or retry. `crypto.randomUUID()` produces a suitable
key. Keys must have 16–100 characters: letters, numbers, underscores or hyphens.

```json
{
  "idempotencyKey": "86e7e41f-36af-4b56-a356-20bf7e70fd11",
  "feeStructureId": "<structure UUID>",
  "studentIds": ["<student UUID>"],
  "dueDate": "2026-12-01T00:00:00Z"
}
```

- First success: HTTP 201, `replayed: false`. Matching retry: HTTP 200,
  `replayed: true`, the same `batchId` and existing invoices. `created` is the
  batch's invoice count on both responses; use `replayed` to distinguish them.
- A changed request with the same school/key returns HTTP 409
  `IDEMPOTENCY_CONFLICT`. Recipient ordering and duplicate IDs do not change
  request identity. Omitted and null due dates are equivalent.
- Omit `studentIds` to select active students in the structure's class, or all
  active school students for an unrestricted structure. An explicit empty
  array is rejected with HTTP 422.
- Retries preserve the original recipients and fee snapshots even after a
  structure changes or becomes inactive. They return the invoices' current
  status, including cancellation. An empty first batch also remains empty.
- New keys intentionally create new billing operations. This does not impose
  one invoice per student per term. Do not generate a fresh key for a retry or
  delete batch records. Keys are scoped to the school.
- Invoice creation, batch registration and the audit record commit together
  under the existing school transaction lock.

## Editing and cancellation

`PATCH /api/v1/fees/structures/:id` accepts a nonempty body containing `name`,
`isActive` and/or `items`. Items replace the structure's items atomically.
Categories must be distinct, active and belong to the school. Individual
amounts and their sum must fit positive PostgreSQL integer NGN values.
Issued invoice snapshots are preserved. Create a new structure to change its
calendar or class targeting.

`POST /api/v1/fees/invoices/:id/cancel` accepts:

```json
{ "reason": "Invoice issued to the wrong student" }
```

The trimmed reason must have 3–500 characters. Cancellation preserves the
invoice's original total and items, sets `CANCELLED` and clears outstanding.
Invoices with paid amounts, allocations or receipts are refused with HTTP 409.
Repeat cancellation returns the cancelled invoice without a duplicate audit
record. The original reason remains in the audit log. Later allocation is
blocked; racing payment and cancellation requests cannot both commit.
Both endpoints require staff access and `fees:write`.

## Onboarding

`GET /api/v1/schools/onboarding` requires `settings:write` and returns
`completed`, `readyForCompletion`, checks and scoped counts. Completion requires:

1. An active school with a name and URL, plus its school site.
2. An ACTIVE or TRIAL subscription.
3. One current session with one current term.
4. An active class and an active subject assigned to an active class.
5. At least one active student enrolled in an active class in that session.
6. At least one active parent profile linked to an active child, with an active
   user and an active PARENT membership in the school.

`POST /api/v1/schools/onboarding/complete` returns HTTP 400
`ONBOARDING_INCOMPLETE` with checklist details if setup is missing. Completion
and its audit record are transactional. `completed` records the milestone;
it is not automatically cleared when setup later changes. The checklist checks
a minimum working setup, not configuration of every student or parent.

## Verification and remaining work

Run `npm test`, `npm run test:integration` and `npm run test:migrations`.
The regression suite passed 45 tests, the PostgreSQL suite passed 28 tests,
and `npm run build` succeeded.
The database checks create private temporary PostgreSQL databases; see
`POSTGRES_FIX_GUIDE.md` for requirements and safeguards.

Still required: invoice corrections, retry-safe manual payment entry, audited
accounting reversals and provider refunds/reconciliation; invitation tokens and
delivery; spreadsheet uploads/exports; notification workers/providers; identity
policy and obsolete code cleanup. This batch does not certify deployment
readiness.
