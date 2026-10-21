# Render + Supabase + Resend deployment runbook

## Target and scope

This deployment uses the existing Express/Prisma authentication and school
permissions. Supabase provides PostgreSQL only; do not replace portal sessions
with Supabase Auth or connect the frontend directly to school database tables.

Use a separate Supabase project for staging. Never use real student data during
acceptance testing. No cloud service was created or deployed by this batch.

## Email and cost

Use EMAIL_PROVIDER=resend (HTTPS API). Resend's published free transactional plan
currently includes 3,000 emails/month, limited to 100/day; Pro currently starts at
$20/month for 50,000 emails with no daily cap. Every recipient of our API sends
counts against the transactional quota, including school announcement fanout.
Verify the sender domain in Resend and use an EMAIL_FROM on that domain. A domain
may have a separate purchase cost. Do not treat API acceptance as inbox delivery.

Render free web services block outbound SMTP ports 25, 465 and 587, and sleep
when idle. Background workers do not have a free instance option. For reliable
staging/release delivery, use a paid background worker with the combined
`npm run email:worker:all` command; this replaces two separate worker services.
It handles invitations/reset, scheduled announcements and notification delivery.
Existing separate worker commands remain available; do not launch all variants
unnecessarily. API/web hosting is a separate compute charge. Check Render's
current checkout pricing; this runbook does not promise zero-cost hosting.

Sources (checked 2026-10-18):
- https://resend.com/pricing
- https://render.com/docs/free
- https://render.com/docs/your-first-deploy
- https://render.com/docs/background-workers

## Database connection and exposure

Copy the Supabase Session pooler URI from Connect, normally an IPv4 pooler host
on port 5432. Supabase recommends session mode for persistent IPv4 backends.
Use a URL-encoded database password. Include TLS configuration (sslmode=require
at minimum); use certificate verification and the project's CA where needed.
Do not fix certificate errors with rejectUnauthorized:false. Keep the database
password, service keys and connection strings in Render secrets, never Git.

The API and combined worker default to at most five connections each through
DB_POOL_MAX=5. Count all services, replicas, migration tools and other clients
when comparing this with the project's pool budget. Scale pool sizes explicitly.
Migrations use DATABASE_URL in this repository; use the session pooler or a
reachable direct connection for migration operations, not a transaction pooler.

In Supabase, disable the unused Data API for this backend-only project. Confirm
that REST/GraphQL access cannot read/write portal tables using a publishable/anon
key. Do not assume Prisma-created public-schema tables have RLS policies. If you
later enable direct client access, that requires a separate grants/RLS design.

Sources:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/prisma
- https://supabase.com/docs/guides/api/securing-your-api

## Render configuration

Review render.example.yaml and RENDER_ENV.example. The YAML is a template;
creating/importing its two starter services incurs charges. Create a shared
Render environment group named schoolos-staging, supplying actual secret values
through Render. The API and worker must share DATABASE_URL, AUTH_EMAIL_KEY and
email settings. Use separate secrets and database from production.

API:
- Build: npm ci --include=dev && npm run build
- Pre-deploy: npx prisma migrate deploy
- Start: npm start
- Health check: /api/v1/health/ready

Combined worker:
- Build: npm ci --include=dev && npm run build
- Start: npm run email:worker:all

Apply migrations once before initially starting the worker. The worker does not
run migrations. Review the migration history against any existing database;
never substitute db push/reset for a release migration. Render supplies PORT;
Node's listener accepts the platform's port. Select nearby Render/Supabase regions.
Pre-deploy command availability depends on the Render plan. For a free demo web
service, run migrations separately; do not move migrations into every worker.

Set WEB_URL to the exact frontend HTTPS origin for invitation/reset links, and
CORS_ORIGINS to the permitted exact origin(s), comma-separated. While no frontend
exists, supply the planned staging frontend origin and test API flows directly.
A click-through invitation/reset test remains pending until those pages exist;
HTTP token acceptance can be tested independently of the frontend.

Run npm run release:check with the intended release environment. It checks for
obvious missing/placeholder secrets, HTTPS origins, enabled email and a TLS DB
URL. It does not connect to services and never prints secret values. It cannot
prove sender verification, grants, TLS trust, proxy routing or delivery.

TRUST_PROXY defaults to false. Set it only to confirmed proxy peer IPs/subnets
(or the supported loopback/linklocal/uniquelocal aliases when appropriate for
that network). Blanket true, numeric hop counts and universal subnets are
rejected. Verify that an external client's spoofed X-Forwarded-For cannot choose
its rate-limit identity. Capture trusted peer information privately in staging;
do not add a public header/diagnostics endpoint. Do not declare this check passed
until the actual Render routing configuration has been verified.

Keep one API instance for the initial MVP. Rate limits are process-local; add a
shared limiter store before scaling replicas. Do not provision delegated
PLATFORM_ADMIN accounts for the MVP: assignment scope remains deferred.

## Probes, supervision and release acceptance

GET /api/v1/health is liveness. GET /api/v1/health/ready checks PostgreSQL and
returns 200 {status:ready} or 503 {status:unavailable}, with no-store caching.
The server checks database availability before listening and exits nonzero on
startup failure. Connection acquisition is bounded to five seconds. Readiness
does not verify migration state or email delivery; deployment must run migrations.

Run the acceptance flow in MVP_BACKEND_ACCEPTANCE.md with staging accounts.
Verify an invitation and password-reset email reach a controlled mailbox; accept
the invitation/reset token through the API, then verify login, session refresh
and logout. Verify an attendance/result/receipt email and its correct school/
recipient. Check the encrypted auth queue and notification outbox status without
logging token bodies or recipient data. Stop/restart the worker and confirm
pending jobs resume; watch failures, expiry and provider quota in the dashboards.
Do not enable live payments for the manual-payments MVP.

## Backup and restore

npm run test:restore performs a fully local rehearsal: creates a temporary
PostgreSQL cluster, deploys migrations, seeds synthetic data, pg_dump/pg_restore
into a separate empty database and compares every public table by row count and
content fingerprint. It never reads the configured Supabase database.

For staging/production, define and verify the actual backup schedule, retention
and owner in Supabase or an encrypted external backup store. Free-plan backup
features must be checked in the current dashboard. Store backups outside Render's
ephemeral filesystem. Use PostgreSQL client tools compatible with the server.
When restoring, target a NEW isolated database/project; never overwrite the live
one for a rehearsal. Use password prompts or a protected pgpass configuration,
not credentials typed into shell history. Verify schema, constraints, account/
school links, financial balances and representative API reads on the restored
copy. Block real outbound email/payment access in a restored test environment.
Record the backup timestamp, restore duration and observed data loss window.
The local rehearsal is not evidence that a hosted backup can be restored.

## Status to record before release

Record actual service URLs, commit, migration status, readiness probe result,
proxy test, Supabase API exposure check, delivered mail evidence, worker restart,
staging acceptance and restore evidence. Until these are recorded, hosted
release acceptance is pending. No credentials or real personal data belong in
this runbook or the acceptance report.
