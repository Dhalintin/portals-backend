# Fifth fix batch: invoice corrections and manual payment lifecycle

## Implemented files

- `src/features/fees/fees.validation.ts`: manual payment keys and amount/method
  limits; invoice correction and reversal inputs.
- `src/features/fees/fees.service.ts`: manual payment deduplication, corrections,
  full manual accounting reversal, active allocation balance calculation,
  transactional financial audit insertion and closed-payment protection.
- `src/features/fees/fees.controller.ts`, `fees.routes.ts`: new endpoints and
  HTTP 200 on manual payment replays.
- `prisma/schema.prisma` and
  `prisma/migrations/20261013160000_manual_payment_lifecycle/migration.sql`:
  nullable manual payment key/hash, `REVERSED` status, reversal metadata,
  allocation reversal timestamps and receipt void timestamps. Existing rows
  are preserved. The reversing actor is recorded in the transactional audit log.
- `tests/regression.test.cjs`, `tests/postgres.integration.test.cjs`: closed
  payment checks, retries, tenant/permission boundaries, correction validation,
  preserved history, balance restoration and races.

## Apply locally

No new dependencies are needed. The configured database has not been migrated.
After checking its connection, run:

```powershell
npx prisma migrate deploy
npx prisma generate
npm run build
```

All pending migrations are applied, including earlier batches if still pending.
Preserve migration history. Build/dev scripts retain the compiled JavaScript
workflow. Tests use their own temporary PostgreSQL databases.

## Manual payment entry: frontend change required

`POST /api/v1/fees/payments` now requires an `idempotencyKey`. Generate one UUID
for each intended payment, store it before sending, and reuse the key and body
on retries. Do not create a new key after a timeout.

```json
{
  "idempotencyKey": "86e7e41f-36af-4b56-a356-20bf7e70fd11",
  "amountNgn": 25000,
  "method": "CASH",
  "allocations": [{ "invoiceId": "<invoice UUID>", "amountNgn": 25000 }]
}
```

Keys are scoped to the school and have 16–100 letters, numbers, underscores or
hyphens. First success returns HTTP 201 with `replayed: false`; matching retries
return HTTP 200 with `replayed: true`, the same payment and its current history.
Changing amount, method, note, paid date or allocations with the same key returns
HTTP 409 `IDEMPOTENCY_CONFLICT`. Allocation ordering does not change request
identity. Omitted and empty allocations are equivalent. A failed transaction
does not consume the key. A retry after reversal returns the reversed payment
and cannot create another payment.

Methods are CASH, BANK_TRANSFER, POS or OTHER; ONLINE is reserved for provider
payments. Amounts are whole NGN, from 1 through 2147483647. Initial allocations,
receipts, balances and the creation audit commit with the payment. Existing
payments with no key cannot be matched retrospectively.

`GET /api/v1/fees/payments/:id` requires staff access and `payments:read`, and
returns the school-scoped payment, allocations and receipts.

## Invoice corrections

`PATCH /api/v1/fees/invoices/:id` requires staff access and `fees:write`.
Include a 3–500 character reason and `items`, `dueDate`, or both:

```json
{
  "reason": "Correct the tuition amount",
  "items": [{ "feeCategoryId": "<school category UUID>", "amountNgn": 30000 }],
  "dueDate": "2026-12-01T00:00:00Z"
}
```

Items replace the invoice items, using distinct active categories in the same
school. Descriptions snapshot category names. The total and outstanding balance
are recalculated; `dueDate: null` clears the date. Past-due unpaid invoices become
OVERDUE. Corrections preserve invoice identity and numbering and record before/
after values and the reason in the audit log.

Cancelled invoices and invoices with any payment, allocation or receipt history
cannot be corrected. Reversed payment history still counts as history. These
cases need a credit/reissue workflow; this patch does not erase history.

## Manual accounting reversal

`POST /api/v1/fees/payments/:id/reverse` requires staff access and
`payments:write`. Body:

```json
{ "reason": "Duplicate cash entry" }
```

Only a successful MANUAL payment can be fully reversed. This is an accounting
correction; it does not send money or claim that cash has been refunded. Provider
payments are rejected with HTTP 409 `MANUAL_PAYMENT_REQUIRED`.

Reversal sets REVERSED, preserves the original amount/date/note and records
`reversedAt` and `reversalReason`. All allocations remain stored with
`reversedAt`; receipts remain stored with `voidedAt`. Invoice paid/outstanding
balances are recalculated from active allocations on successful payments.
Unrelated payments remain effective. Successful-payment collection summaries
exclude the reversed amount. The actor, reason, amount, allocation IDs and
receipt IDs are audited in the same transaction.

Repeating a reversal with the same reason returns the reversed payment without
another audit record. A changed reason returns HTTP 409 `REVERSAL_CONFLICT`.
Reversed payments cannot be allocated again. Allocation rechecks payment status
inside the school lock, protecting races with reversal. Closed REFUNDED or
REVERSED payments also cannot be revived by provider verification.

**Frontend handling:** display reversed payments clearly and mark receipts with
`voidedAt` as void. Receipt endpoints retain history; do not count void receipts
or reversed allocations toward paid totals. Use the invoice's cached paid and
outstanding balances, or filter history by the supplied timestamps/status.

## Verification

`npm test` passed 46 regression tests. `npm run test:integration` passed 35
tests against real PostgreSQL. `npm run test:migrations` replayed all 22
migrations with no schema drift. `npm run build` passed. The temporary test
servers were stopped and their directories removed; the configured database
was not changed.

## Remaining work

Actual provider refunds/reconciliation, partial reversals, credit notes and
standalone allocation-request idempotency remain. The separate
`POST /payments/:id/allocate` endpoint still must not be blindly retried after a
timeout; check payment history before resubmission. Its audit now commits with
its allocations, and balance/status checks remain protected by the school lock.

The next broader batch is expiring invitation tokens and password-reset/invite
delivery. Spreadsheet uploads/exports, notification workers, identity policy
and obsolete code cleanup also remain. This is not a deployment certification.
