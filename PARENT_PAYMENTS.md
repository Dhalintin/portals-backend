# Parent payments — batch 2

## What changed

- Parent portal uses the same navy and gold as the staff portal.
- Each child's bills list the amount paid and remaining for each fee item.
- Select one item, several items, or all outstanding items for that child, then continue to Paystack checkout.
- The server calculates the amount. Parents cannot supply a price or pay another child's bills.
- A combined checkout creates one payment and a receipt for each invoice it covers. Receipts include the child, admission number, school, date, payment reference, method and the actual items paid.
- View receipts and choose **Print / Save PDF**. Older receipts without an item snapshot show their original payment amount and invoice reference.
- Checkout attempts survive reloads. **Continue payment** uses the same attempt; **Check payment status** verifies it before another payment is started.
- Successful provider verification is required before balances change. Webhook and browser retries share the existing transaction locks and finalization checks.
- If another payment settles an item while checkout is open, any excess becomes unallocated school credit with its own receipt. It is not silently applied to a different item. Contact the bursar to allocate or refund that credit.

## Database and deployment

The migration adds two nullable JSON columns. Existing invoices, payments and receipts are retained.

Run from the backend project against the intended database:

```powershell
npx prisma migrate deploy
npm run build
```

For local development, apply the migration to the database your local backend uses, then restart it. Deploy the frontend and backend together. No additional npm dependencies are needed.

## Enable online payments

Use Paystack test mode first. Configure on the backend:

```dotenv
PAYSTACK_SECRET_KEY=your_paystack_secret_key
PAYSTACK_SCHOOL_SUBACCOUNTS={"school-uuid":"ACCT_verifiedSchoolCode"}
WEB_URL=https://your-frontend.example
CORS_ORIGINS=https://your-frontend.example,http://localhost:3000
```

Replace the school UUID and subaccount code with the real school and its verified Paystack subaccount. A missing/invalid mapping keeps checkout disabled for that school. Add the actual local frontend origin if it uses a different port.

The code sends the school's subaccount to Paystack and sets `bearer: subaccount`; the school bears the payment provider's transaction fee. Accounting and receipts show the gross amount paid, rather than the settlement amount after fees. The bank account saved in school settings remains direct bank transfer instructions; saving it does not create or change a Paystack subaccount.

Set the Paystack webhook URL to:

```text
https://your-backend.example/api/v1/payments/webhook
```

See Paystack's [payment verification](https://paystack.com/docs/payments/verify-payments/) and [transaction API](https://paystack.com/docs/api/transaction/) documentation. The checkout return address is restricted to configured frontend origins. A callback alone does not count as payment confirmation.

## Offline behaviour

- Open the parent portal and each child's fees while online to save their records. Open a receipt to save that receipt.
- The production service worker prepares a public `/offline-parent` shell. It does not cache authenticated API responses or private navigation HTML.
- When offline, use **Open saved parent portal**. Records are scoped to the signed-in account and school, carry a saved-copy timestamp, and expire after 24 hours under the existing offline cache policy.
- Checkout and payment verification require a connection. Money is never charged by an offline sync queue.
- Reconnect and refresh to check current balances or receipt reversals.

## Quick acceptance check

1. Sign in as a linked parent and open **Fees and receipts** for one child.
2. Select PTA only and confirm that the displayed total equals PTA's remaining balance.
3. Complete a Paystack test checkout. Tuition should remain outstanding; PTA should be paid.
4. Open and print the receipt. It should say PTA and the actual amount paid.
5. Select all remaining items and complete one test checkout. Each selected invoice should receive a receipt.
6. Refresh the return page or verify again. No extra payment, allocation or receipt should appear.
7. Attempt to use another child's item or receipt ID. Access must be denied.
8. Open the portal, bills and a receipt online, then go offline. Saved records should open with their timestamp; paying must remain unavailable.

No real payment or deployment was performed as part of this code change. Integration tests mock only the external provider and use disposable PostgreSQL.
