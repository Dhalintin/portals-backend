# Sixth fix batch: invitations and account email delivery

## Changed files

- `src/features/auth/invitations.service.ts`: pending, hashed, expiring tokens;
  new-user and signed-in acceptance; revocation and authorization rechecks.
- `src/features/memberships/memberships.service.ts`, `memberships.validation.ts`,
  `memberships.routes.ts`: invitations replace administrator-chosen passwords;
  invitation listing/revocation; serialized membership changes; proprietor
  access restrictions and transactional membership audit records.
- `src/features/parents/parents.service.ts`, `parents.validation.ts`: pending
  parent invitations; profiles connect only after acceptance.
- `src/features/auth/auth.service.ts`, `auth.validation.ts`, `auth.routes.ts`:
  queued reset delivery, acceptance endpoints, consistent reset responses and
  a 72-byte UTF-8 password limit to avoid bcrypt truncation.
- `src/auth/jwt.ts`: removes decoded authentication token debug logging.
- `src/middlewares/authenticate.ts`, `rateLimit.ts`: removes user/claim debug
  logging and limits invitation requests to 100 per authenticated manager per
  hour. This uses the current in-memory store; multi-instance deployment needs
  a shared rate-limit store.
- `src/lib/authEmail.ts`, `src/workers/authEmailWorker.ts`, `src/config/env.ts`:
  SMTP/Resend adapters, encrypted queue, bounded retries and worker configuration.
- `prisma/schema.prisma` and
  `prisma/migrations/20261013170000_invitations_and_auth_email/migration.sql`:
  `SchoolInvitation` and `AuthEmail` tables.
- `package.json`, `package-lock.json`: Nodemailer and its TypeScript definitions,
  worker command and adapter tests. Existing build/dev/watch scripts are retained.
- `tests/auth-email.test.cjs`, `tests/postgres.integration.test.cjs`,
  `scripts/test-database.cjs`: adapter and database coverage with fake secrets
  and mocked delivery. No real email was sent during verification.

## Required setup

Nodemailer and `@types/nodemailer` are installed in this checkout. On another
checkout, use `npm ci` with the updated lockfile. The configured database has
not been migrated. Apply pending migrations and rebuild:

```powershell
npx prisma migrate deploy
npx prisma generate
npm run build
```

Use `AUTH_EMAIL_ENV.example` to configure WEB_URL, EMAIL_FROM and AUTH_EMAIL_KEY.
Generate the encryption key locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep the key in your secret store. The API and worker must use the same key.
Do not rotate it while encrypted jobs are pending without a key migration plan.
WEB_URL must be HTTPS in production. Reset requests validate link/key
configuration before looking up either known or unknown accounts.

Select one provider through EMAIL_PROVIDER:

- `smtp`: configure host, user, password and sender. Port 587 with
  SMTP_SECURE=false requires STARTTLS; port 465 with SMTP_SECURE=true uses TLS.
  Certificate verification remains enabled. See [Nodemailer SMTP documentation](https://nodemailer.com/smtp).
- `resend`: configure RESEND_API_KEY and a sender authorized by your Resend
  account. Requests use the REST API and an idempotency key based on the queue
  job ID. See [Resend sending documentation](https://resend.com/docs/api-reference/emails/send-email)
  and [idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
- `disabled`: no worker delivery. Requests can queue encrypted jobs when link
  and key configuration exists, but these will expire without a running worker.

After configuration, run the API as usual and run this as a separate process:

```powershell
npm run email:worker
```

Use your process supervisor to manage both processes. The worker validates its
configuration before consuming jobs and stops gracefully on SIGINT/SIGTERM.
Do not start a live worker until you intend to send queued emails. This patch
has not validated delivery against your real SMTP server or Resend account.

## Invitation API and frontend changes

`POST /api/v1/memberships` still accepts email, firstName, lastName, role and
optional phone. It now returns a pending invitation, not an active membership.
The `password` field is rejected. No user or school membership is created until
acceptance. The invited user chooses their own password.

`POST /api/v1/parents/:parentId/invite` accepts only email. It no longer accepts
an administrator-supplied password or links the parent immediately. Acceptance
atomically creates/reuses the PARENT membership and connects the parent profile.
An existing active PARENT membership can be reused; staff memberships are not
overwritten or converted. Batch fourteen permits one parent profile per user per school. See PARENT_TENANCY_FIX_GUIDE.md for the required migration.

Inviting requires an active PROPRIETOR, SCHOOL_ADMIN or PRINCIPAL manager. Only
a proprietor can invite another proprietor or alter proprietor membership.
The inviter's current authorization is rechecked on acceptance. Suspension,
expired tokens and inactive schools prevent acceptance. Membership updates
share the school transaction lock so concurrent changes cannot remove the last
active proprietor.

Links expire after 48 hours. A fresh invitation for the same school/email (or
parent profile) revokes older pending links. Use the latest email link.
Pending invitations can be managed through:

- `GET /api/v1/memberships/invitations`: latest 100, with safe metadata and
  accepted/revoked/expiry timestamps; token hashes are excluded.
- `POST /api/v1/memberships/invitations/:id/revoke`: revoke a pending invitation.

Both management endpoints require memberships:write in the current school.

New-account acceptance:

```http
POST /api/v1/auth/invitations/accept
Content-Type: application/json

{ "token": "<email token>", "password": "<invitee chosen password>" }
```

For an existing account, sign in to that account through an existing school or
platform login, then use its access token:

```http
POST /api/v1/auth/invitations/accept-existing
Authorization: Bearer <existing account access token>
Content-Type: application/json

{ "token": "<email token>" }
```

The existing-account endpoint never changes the password, profile or other
school access. A different signed-in user cannot accept the invitation. A
disabled membership is not reactivated through invitation acceptance; an
administrator must update it explicitly. Acceptance is single-use and returns
membershipId, schoolId and role; sign in or switch to the new school afterward.

An existing user without another active school login can use
`POST /api/v1/auth/invitations/accept-existing-password` with
`{ "token": "<email token>", "currentPassword": "<existing password>" }`.
This verifies the current password under the user transaction lock, grants the
invited membership and leaves the password unchanged. It cannot create an
account or replace its password. Google-only users must use authenticated
acceptance or first set a password through the normal reset flow.

Build frontend `/accept-invitation` and `/reset-password` pages. Tokens are in
the URL fragment (`#token=...`), not the query string. Read the fragment, remove
it from browser history, then submit the token in the API body. Do not log it or
send it to analytics. Existing-account acceptance should offer sign-in, not
password replacement.

## Password reset and delivery semantics

`POST /auth/forgot-password` returns `{ok:true}` for known and unknown users.
It never returns devToken. Known active users get an encrypted queued reset
link, valid for one hour. Reset token hashes and queue insertion commit together.
The existing one-use reset flow revokes sessions across schools on success.

Queue payloads use AES-256-GCM; token tables store hashes. Workers claim jobs
atomically with SKIP LOCKED, use UTC for timestamp comparisons and retry failed
sends up to five attempts with backoff. Expired queued payloads are cleared.
After provider acceptance, the encrypted body is cleared and status is SENT.
SENT records provider acceptance, not guaranteed inbox delivery. Authentication
links that were revoked or consumed remain invalid even if an earlier queued
email arrives later.

SMTP delivery is at least once: a crash after SMTP acceptance but before the
database acknowledgment can produce a duplicate email. Resend uses its provider
idempotency mechanism. Tokens remain single-use in either mode. General school
announcement/WhatsApp delivery remains separate work; this worker only sends
authentication emails.

## Verification

The regression suite passed 54 tests, including both transport adapters,
encryption, configuration checks and password byte limits. The real PostgreSQL
suite passed 45 tests, including concurrent acceptance, parent links, password
reset, queue claims/retries and last-proprietor protection. All 23 migrations
replayed with no schema drift, and `npm run build` passed. Delivery was mocked;
the temporary servers and databases were cleaned up.

## Remaining work

Spreadsheet uploads/exports, general notification workers/providers, multi-school
parent/role policy, provider refunds and obsolete code/dependency cleanup remain.
Batch six initially found 13 dependency advisories, including one critical.
Batch seven addresses these through reviewed updates and removal of unused
packages; see `DEPENDENCY_SECURITY_FIX_GUIDE.md`. No blanket
`npm audit fix --force` was applied. Deployment readiness still requires the
remaining application work and configuration checks.
