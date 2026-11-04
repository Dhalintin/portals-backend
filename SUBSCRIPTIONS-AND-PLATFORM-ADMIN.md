# SchoolOs subscriptions and platform administration

## What is included

- ₦300 per active student per term. Each student is charged once for an issued term; archiving a student does not remove an incurred charge. Newly active students are added automatically.
- Every newly activated school gets a 30-day trial. Existing subscriptions get their billing activation date when this migration is applied; closed pre-activation terms are not retrospectively billed.
- Two instalment targets: 50% at the start of the term, remaining balance by day 30. The first 30 days are the grace period, not an extra 30 days after the second instalment. Paying in full is also supported; family contributions can arrive in smaller payments against the school total.
- After trial/grace expires, unpaid schools can view and export existing records. New online school work and offline uploads pause until paid. Offline work is retained for retry. Subscription checks never delete a school's records.
- A paid term ends on its recorded end date. A dated new current term is needed for the next subscription. Old overdue bills must also be settled.
- School sponsored, parent sponsored or shared sponsorship. Only the owner chooses the split; the school remains liable for the entire term bill. Choose and disclose parent contributions before the term begins. A term's split is locked when a payment is pending or confirmed.
- Parents/students can pay their own contribution online once per child per term; results are not sold per view. SchoolOs money is separate from tuition, school bank accounts and school-fee receipts.
- Annual full prepayment: 10% discount, ₦270 per student per term, for three dated terms in one school year before regular payments start. New students produce additional charges. An annual payment pending review prevents conflicting payments for that year. Reversing the annual payment removes its discount if no other confirmed annual payment remains.
- No setup fee; basic onboarding included. Provider processing charges are separate; SchoolOs adds no tuition-payment commission.
- Online Paystack checkout, signed webhook processing and server-side amount/currency/reference verification; manually submitted bank/mobile transfers remain pending until reviewed.
- Idempotent payment attempts, unique bank references, printable receipts, visible overpayment credit, audited allocation/reversal and reasons for manual decisions. Accounting reversals do not issue bank/provider refunds.

## Apply the code

Run from the backend folder against the intended database, with its existing DATABASE_URL configured:

```powershell
npx prisma migrate deploy
npm run build
```

Deploy the backend and frontend after the migration. No extra npm dependencies were added. This work has NOT applied the migration to your shared or deployed database.

The migration is `prisma/migrations/20261103170000_term_subscriptions/migration.sql`. Do not use `prisma db push` on staging/production.

Existing schools need a current school year and current term with start and end dates. Billing dates are snapshotted when a term bill is issued so changing the calendar cannot erase an overdue bill. Keep the term calendar correct before activation. Legacy free-plan student caps are replaced by per-student billing.

## Create the first platform administrator

Use a dedicated email that is not a school owner account. After building the backend, run the following in a private PowerShell terminal; the password prompt hides your typing:

```powershell
$env:SCHOOLOS_ADMIN_EMAIL = Read-Host 'Platform administrator email'
$env:SCHOOLOS_ADMIN_FIRST_NAME = Read-Host 'First name'
$env:SCHOOLOS_ADMIN_LAST_NAME = Read-Host 'Last name'
$adminSecret = Read-Host 'Password (12+ characters, letter and number)' -AsSecureString
$env:SCHOOLOS_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
try { node scripts/bootstrap-platform-admin.cjs }
finally { Remove-Item Env:SCHOOLOS_ADMIN_PASSWORD -ErrorAction SilentlyContinue; $adminSecret.Dispose() }
```

The command refuses to run if an active super administrator already exists or the email is already registered. It does not promote school users or contain a default password. This command was added, not executed against your database.

Sign in normally. A platform administrator opens `/admin`; school users cannot open the platform console. Use Platform team to add subsequent administrators. Only super administrators can manage platform administrators or change the platform receiving bank account. Disabling an administrator revokes their sessions; self-disable and removal of the last active super administrator are prevented.

## Configure payments

1. In `/admin/settings`, enter the SchoolOs receiving bank, account name/number and billing support email. Your current platform password is required. This does not alter school tuition accounts.
2. Configure the existing PAYSTACK_SECRET_KEY on the backend for online subscriptions. Use test keys for staging.
3. Keep WEB_URL/CORS_ORIGINS set to the exact frontend origins; checkout callbacks accept configured origins only.
4. Use the existing webhook URL `BACKEND_ORIGIN/api/v1/payments/webhook` in Paystack. Subscription references start with SCHSUB-. Existing school-fee references keep using the tuition flow.
5. Do not treat a browser success redirect or a submitted bank reference as proof of payment.

## School workflow

1. Open Subscription in the owner's/admin's/bursar's sidebar.
2. Check students billed, rate, confirmed paid, still owed and due date.
3. Owner: open Who pays for SchoolOs and choose sponsorship before collecting payments.
4. Open Pay or report a bank transfer. Pay the first 50%, the remaining balance, or choose full annual prepayment where eligible.
5. For a transfer, send money to the displayed SchoolOs account and submit the bank's unique reference. Wait for platform verification.
6. Use Payments and receipts to check online status, resume checkout and print confirmed receipts.
7. Parent/student contributions appear with each child's fees, separate from school bills. Students must provide a valid receipt email before checkout.

## Platform administrator workflow

- Overview: school/student counts, actual confirmed subscription receipts, unpaid issued bills and pending transfer reviews. Receipts are not tuition income or monthly recurring revenue.
- Schools: search and open a school for owner contact, school counts, calendar, bill calculation, payments and recent audit history.
- Payments: verify pending online transactions against Paystack; review transfer claims against the receiving bank; confirm or reject with a reason. Confirmed records can be reversed in accounting with a reason; refund externally before recording a reversal when appropriate.
- Received transfer outside the app: open the school's Record a received bank or mobile transfer form. Select the bill, enter amount/reference and verification note, and confirm that the bank was checked.
- Reactivation: paying an overdue bill restores normal saving automatically if the school is otherwise active. A manually paused school needs Restore school login, or the explicit restore option when confirming its transfer. Restoring login does not forgive its unpaid bill.
- Temporary exception: grant a reasoned extension of at most 31 days; it does not mark debt paid. Remove an extension when it is no longer appropriate.
- Activity: review recent payment/access/bank/team changes. Payments exports contain the currently filtered page, not every record in the database.
- Never share administrator accounts. The console does not impersonate school users, edit school results or silently forgive balances.

## Verification and release boundary

Tests use disposable local PostgreSQL clusters and mocked gateway calls; no real charges, emails or shared-database accounts are created. Before collecting real money, deploy with Paystack test keys and run one school checkout, signed webhook, transfer review, receipt and renewal check end-to-end. Switch to live credentials only after the receiving account and callbacks have been verified.

Admin-console references used for scope: [Stripe Billing](https://stripe.com/billing/subscriptions) and [ChartMogul](https://chartmogul.com/). The console uses school/term balances and confirmed receipts rather than misleading monthly subscription metrics.

## Checks completed for this change

- Backend regression suites: 111 checks passed.
- Frontend regression suite: 193 checks passed, including permission checks and retaining queued saves on subscription expiry.
- Focused private PostgreSQL billing/parent-payment checks: 12 passed, covering tenant/family isolation, grace boundaries, seats, two instalment targets, annual quotes/discounts, signed webhook routing, duplicate attempts, transfer approval, reactivation, bank/team permissions, overpayment credit and reversal.
- The broad private integration run passed 145 of 146 checks; its one stale assertion expected the old parent return URL. That assertion was corrected to `/parent/fees` and its payment flow passed the focused rerun.
- Final migration replay and Prisma schema comparison passed in a disposable PostgreSQL database.
- Both TypeScript builds passed; the frontend production build used a separate preview directory.
- Fresh headless Chrome with fake data passed school transfer submission, platform approval, balance refresh, printable receipt, admin school search, desktop/mobile overflow checks and landing pricing.
- Real provider settlement, real email delivery and deployed staging configuration were not exercised by these isolated tests.
