# Bursar workflow — batch 3

## What is included

- The bursar's dashboard and Fees page open the same finance workspace.
- Current-term cards show expected fees, confirmed receipts against bills and outstanding balances. Unallocated school credit is shown separately and covers all terms.
- Charts show collection progress, payments credited to the selected term's bills over the last 14 Lagos dates, and the six classes with the largest balances.
- Search students by name, admission number or class. Lists use 25 rows by default, with 50 and 100 available.
- Choose **Record payment**, enter the amount received and method, then save once. The preview shows how the amount covers the student's oldest outstanding bills. Partial payments are supported.
- Owners/admins can reach this form from the expanded student bill view. Existing bill-specific forms remain available to recover earlier attempts.
- **Reports & printing** includes debtors, students who have made payments (including part payments), and creditors/unallocated credit. CSV and print/PDF exports include every report row, rather than just the visible student page. The on-screen report preview is capped at 100 rows.
- Credit reports group known credits by student. Payments with no reliable student link remain labelled unassigned for review. Credit is received money not allocated to a bill; it is not automatically refunded or deducted from other charges.
- Receipts show the school, student, admission number, date, method, reference, actual items paid and receipt total. Open a receipt to print it or save it as PDF.

## Offline operation

1. Sign in as the bursar while connected and open the finance workspace. This saves the current term and a school/account-scoped account snapshot.
2. Allow the production offline startup preparation to finish. The public `/offline-finance` shell and static code can then open without a connection; private API responses are not cached by the service worker.
3. Record received money normally. The original input, recovery key and student details are committed to IndexedDB before any payment request is sent. If storage fails, recording stops.
4. Offline entries appear under **Saved payments** as pending. They do not change confirmed totals or reports and cannot issue an official receipt yet.
5. Reconnect with the portal open, or reopen it after reconnecting. Pending entries sync automatically. **Sync now** is also available.
6. A server-confirmed entry is retained locally with its receipts. If the response or local confirmation write is interrupted, the same recovery key is retried, so the original payment is recovered rather than duplicated.
7. If another payment changes a saved balance, the complete entry is rejected without creating a payment. Open **Review current student bills**, check the amount actually received, then dismiss the rejected entry and create a corrected entry. Uncertain network, server or permission failures stay pending and cannot be dismissed as if rejected.

Only one pending entry per student is allowed on the same device/account. Browser locks coordinate tabs; server transaction locks and idempotency protect retries. A payment linked to a student cannot be allocated to another student's bills.

Finance snapshots expire after seven days. Attendance and parent cache retention keep their existing one-day default. Pending payment entries have no automatic expiry. When a snapshot expires, the pending queue can still be recovered and synced; reconnect before viewing or recording further student payments.

Keep browser data until every entry is confirmed. IndexedDB is device storage, not a remote backup. Clearing browser data, losing the device or browser storage eviction can remove unsynced entries. Use an up-to-date browser that supports IndexedDB and Web Locks. Automatic sync runs while the portal is open and the staff account still has payment permission.

## Deployment

No new database migration or npm dependency is introduced in this batch. The previous fee-item payment migration must already be applied because the new receipts use its item snapshots.

Deploy the backend and frontend together. New endpoints:

```text
GET  /api/v1/fees/workspace?termId=<uuid>        payments:read
POST /api/v1/fees/student-payments              payments:write
GET  /api/v1/fees/receipt-documents/<receiptId>  payments:read
```

All routes require active school staff access and enforce the current school. The report endpoint returns a consistent database snapshot, excludes draft/cancelled bills and reversed/unsuccessful payments, and omits provider payloads from its response.

The offline finance shell is prepared in production on HTTPS or localhost. Development mode does not register the production service worker.

## Acceptance check

1. Sign in as bursar. Check that the dashboard contains financial cards and charts.
2. Find a student owing tuition and PTA. Enter one payment covering both; save once.
3. Check the student balance and print each resulting receipt. Retrying the saved request must not create another payment.
4. Download/print debtors, paid students and creditors. Confirm that exports include students beyond page 1 and that report totals match their rows.
5. Load accounts online, then go offline and reopen **Open saved school accounts**. Record one student's payment, close/reopen the page, and check that the pending entry remains.
6. Reconnect. Check that it confirms once and receipts become available.
7. While a device is offline, record a payment against the same bill from another device. Reconnect the first device: its stale entry must require review and leave the server ledger unchanged.
8. Remove payment permission or switch accounts. The original queue must not be submitted in the new workspace or silently discarded.

Automated integration tests use disposable PostgreSQL and do not change your local/shared school database. No real payments, deployment or messages were sent for this batch.

