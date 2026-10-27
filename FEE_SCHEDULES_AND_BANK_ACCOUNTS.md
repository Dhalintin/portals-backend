# Class fee schedules and protected bank details

## What changed
The old flow saved fee amounts separately from creating invoices. Estimates therefore increased while the invoice balance stayed zero. The new Save fees & update student bills action saves the class selection, item breakdown and student invoices in a single school transaction. Expected, received and still owed now all use the same term invoice ledger.

## School owner workflow
1. Open Fees → Set fees & extra charges → Set fees.
2. Name the schedule, for example Senior secondary fees.
3. Tick SS1–SS3, use Senior classes, select any other classes, or apply to every class.
4. Enter Tuition, PTA, Exam, Sports, Library and any additional items. Leave unused amounts blank.
5. Check the per-student total and student-count preview, then save. No separate Create bills step is required.
6. Make a cheaper schedule for JSS1–JSS3 using the same item names and different amounts.
7. For an extra class-specific charge, create a new schedule for those classes with a distinct item name.
8. Click an existing schedule to edit it in the full editor. Unpaid bills update in the same transaction. Financial changes that would rewrite paid bills are rejected; use a separate, clearly named adjustment charge instead.
9. Record confirmed money received against a student bill. The term's received and owed figures refresh automatically. Parents can view line items and receipts.

For the requested example, 12,000 + 3,500 + 9,700 + 300 + 2,000 = 27,500 per student. One eligible student means 27,500 expected and 27,500 owed. A 5,000 payment leaves 22,500 owed.

## Consistency safeguards
- One invoice per student per schedule; retry keys prevent duplicate saves.
- Reusing an item in overlapping class schedules is rejected. Disjoint senior/junior schedules can use the same items.
- New enrollment and current-term class changes reconcile applicable fees transactionally. Changes that would remove a paid bill are rejected for review. Student archive does not silently erase existing debt.
- Current-term expected = sum of issued bill totals; received = sum paid against them; still owed = sum of their remaining balances. Cancelled/draft bills are excluded.
- Previous fee templates are labelled Needs assignment. Review classes and save once. Matching prior invoices are adopted where unambiguous; ambiguous overlapping legacy bills require review before duplicate charges can be created. No migration automatically bills students.

## Optional receiving bank account
Settings → Receiving bank account is available to the school creator. The API also checks that the actor is the active creator with the proprietor role. Other staff cannot change it.
- Current password required before requesting verification.
- A cryptographically random 6-digit OTP goes to the creator's login email using the existing encrypted auth-email outbox.
- OTP is tied to the school, creator, exact immutable account proposal and account version. Confirmation accepts only the challenge ID and code.
- 10-minute expiry, 5 verification attempts, one-minute resend wait, maximum 5 requests per school per hour, authenticated rate limiting, single use and 24-hour account-change cooldown.
- Wrong attempt counters commit even when verification is rejected. Concurrent, expired, stale and replayed codes cannot overwrite an account.
- Account details are encrypted at rest. OTPs use a keyed hash; email payloads are encrypted. Bank tables enable row-level security with no public policies. API responses are private/no-store through the existing proxy.
- Requests, failed verifications and confirmed changes are audited without raw codes, passwords or full account numbers. The creator receives a security-change notification.
- Parent transfer instructions show only the confirmed school account. This does not verify bank ownership or enable an automatic payment provider. The school still confirms incoming transfers and records payment/receipts.

## Deploy / local update
This batch adds migration 20261027090000_fee_assignments_and_bank_verification. Update backend and frontend together. In the backend folder, against the intended database:

    npx prisma migrate deploy
    npm run build

Restart the backend after the migration/build. Rebuild/restart or deploy the frontend. No dependency installation is needed.

OTP delivery requires the existing SMTP or Resend configuration, EMAIL_FROM and a persistent 32-byte base64 AUTH_EMAIL_KEY. Keep the existing key; changing it makes existing encrypted account details unreadable. Run the existing email worker, for example npm run email:worker:all. If delivery is not configured, bank-change requests fail closed with a configuration error. Live email delivery and the production migration were not performed in this task.

## Verification
- 77 frontend tests passed, including the requested five-item total and class-scope validation.
- 66 backend regression/security tests passed.
- 94 private PostgreSQL HTTP/integration tests passed. Added real transaction tests for senior/junior schedules, one-class extras, unpaid edits, paid-edit rollback, duplicate requests, foreign classes, enrollment, term totals, encrypted bank details, password/role restrictions, OTP tampering, wrong-code counters, expiry, replay and cooldown.
- All 27 migrations replayed and matched the Prisma schema in a private database.
- Frontend production build passed; desktop/mobile browser flow used disposable data and confirmed 27,500 expected → 5,000 received → 22,500 owed, the full fee editor and bank review/OTP screens. No real financial records or bank settings were changed; no real emails were sent.
