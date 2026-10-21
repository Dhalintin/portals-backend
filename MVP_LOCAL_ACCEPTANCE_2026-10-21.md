# MVP local acceptance — 21 October 2026

## Scope and environment

This pass verifies the current backend against private, temporary PostgreSQL
clusters on loopback. The runner overrides database URLs and secrets, disables
email delivery, and stops/removes its own temporary cluster after verification.
No hosted database, account, email provider or deployment was changed.

## Issue found and corrected

The first run passed 87 of 88 integration tests. Credentialed CORS returned a
wildcard instead of the configured origin. The middleware now uses the trimmed
`CORS_ORIGINS` allowlist. The existing HTTP test checks allowed-origin reflection,
credentials, denial of unlisted origins and unauthenticated API rejection.

The test environment now sets an explicit disposable origin rather than
inheriting a developer's CORS configuration; its unit assertion covers that value.

## Completed results

- Private PostgreSQL integration rerun: 88/88 passed.
- Backend regression suites: 64/64 passed.
- Backend production build and retired-module checks: passed.
- Dependency audit: zero reported vulnerabilities.
- Migration replay: passed with no schema drift.
- Backup/restore: all 39 public tables matched row counts and content fingerprints
  in a separate empty database. The private test cluster stopped successfully.

The HTTP journey covers new-school registration and setup, teacher/parent
invitations and acceptance, enrolment, attendance, result submission/approval/
publication, invoices, idempotent manual payments, parent receipts, cross-school
denial, refresh and logout. Additional integration cases exercise concurrent
assignment changes, invitation restrictions, offline sync retries and workers.

## Hosted checks remain pending

Render/Supabase configuration, production HTTPS cookies/origins, actual invitation
and reset email delivery, worker supervision, hosted backup/restore and physical
phone cold-offline/reconnect acceptance still require the owner-run staging pass.
Use the frontend `MVP_RELEASE_CHECKPOINT.md` for the ordered acceptance journey.
Local success does not establish that these hosted checks have been performed.

No dependencies or database migrations were added by this fix.
