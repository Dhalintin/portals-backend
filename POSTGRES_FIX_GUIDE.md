# PostgreSQL verification and seed fixes

This is the third fix batch. It adds repeatable test data and exercises the
backend against real PostgreSQL. It also fixes the academic-calendar race
discovered by those tests.

Verification completed: all 45 fast regression tests and 22 PostgreSQL
integration tests passed. All 20 committed migrations replayed successfully
on a separate fresh database, and Prisma reported no schema drift. TypeScript
compilation and Prisma schema validation passed. All temporary servers were
stopped and their generated data directories removed.

## Run the checks

```powershell
npm test
npm run test:integration
npm run test:migrations
```

- `npm test`: Prisma generation/validation, TypeScript compilation and the fast
  regression suite, including test-database URL safeguards.
- `test:integration`: initialize a temporary PostgreSQL cluster, create a fresh
  test database from the current Prisma schema, seed two schools and run real
  database/HTTP/concurrency tests. Stop and remove that private cluster afterwards.
- `test:migrations`: initialize a separate temporary cluster, replay all
  committed migrations on an empty database, then compare its resulting schema
  with `prisma/schema.prisma`. Schema drift causes a failure.

These runners do not use the database in your `.env`. They assign their own
loopback port, test database URL and test token/provider secrets. They require
installed PostgreSQL binaries but no new npm dependencies. PostgreSQL 17 and 18
are detected at their standard Windows installation paths; these runs used 17.

For another installation directory:

```powershell
$env:POSTGRES_BIN = 'C:\Program Files\PostgreSQL\17\bin'
npm run test:integration
```

Native child processes start with hidden windows. Cleanup stops only the server
whose data directory this invocation created. Recursive removal verifies that
its resolved target stays inside the system temporary directory with the
runner's generated folder prefix. If shutdown fails, the folder is preserved
and its path is reported instead of deleting a running cluster.

The private server accepts local trust authentication and listens only on
127.0.0.1. It contains test fixtures only and is stopped when verification ends.

## Seed data

`prisma/seeds/index.cjs` creates/upserts fixed-ID fixtures for two schools:

- Active school profiles, site records and FREE subscriptions.
- Owner, teacher, parent and bursar accounts per school.
- Academic session 2026/2027, first/second terms, two classes and Mathematics.
- Three students per school, session enrollments and one linked parent child.
- Published and draft results, grade bands and attendance.
- Tuition categories/structures and a sample unpaid invoice per school.

Schools use slugs `schoolos-test-a` and `schoolos-test-b`. Example accounts are
`owner.a@example.test`, `teacher.a@example.test`, `parent.a@example.test`,
`bursar.a@example.test`, with equivalent `.b` accounts. The test password is
`SchoolOSTest123!`. These credentials are exclusively for test databases.

The runner seeds automatically. For a separately prepared local test database:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://YOUR_TEST_USER:YOUR_TEST_PASSWORD@127.0.0.1:5432/schoolos_test'
npm run seed
```

The manual seed requires an explicit `TEST_DATABASE_URL`. It rejects remote
hosts, URL host redirection and database names other than `schoolos_test` or
`schoolos_test_<suffix>`. It never falls back to your application's database URL.
The schema/migrations must already exist in that dedicated test database.

Repeated seeding keeps fixture IDs and counts stable. It restores the fixture
calendar, identities, memberships and results; resets fixture passwords; bumps
credential versions; and revokes those fixture users' sessions/reset links.
It preserves existing invoice balances/items, allocations and payments, and
does not delete unrelated test records. It is not a production seeder or a
complete reset of a modified test database.

The old seed script used missing files/dependencies and ts-node. The replacement
uses ordinary Node.js and the already installed Prisma/bcrypt packages, avoiding
the TypeScript 7/ts-node compatibility problem.

## Database coverage

The integration suite verifies:

1. Repeatable seeds and admission-number uniqueness per school.
2. Real password login and persisted session hashes.
3. Cross-school student/result/invoice reads are rejected.
4. Parents receive linked, published child results and child-specific fees.
5. Teachers cannot read/write unassigned classes or approve results.
6. Attendance sync rejects foreign students and concurrent retries create one row.
7. Database uniqueness constraints reject duplicate provider references/client keys.
8. Concurrent allocations cannot overspend a payment or an invoice balance.
9. Failed allocations roll back payment, allocations, receipts and cached balances.
10. Concurrent verified webhook replays allocate/receipt once; manual recovery works.
11. Concurrent invoice numbering and student-cap checks remain consistent.
12. Refresh replay revocation, HTTP logout and concurrent password resets persist.
13. Calendar/session/term changes remain consistent under concurrent requests.
14. Re-seeding preserves previously recorded invoice payments.

The database and HTTP endpoints are real. Only Paystack's external verification
response is mocked; no real charges, emails or WhatsApp messages are sent.
Expected uniqueness-rejection tests can print Prisma error logs while passing.

Invoice-numbering tests use two separate generation operations. They do not
claim that retrying invoice generation is idempotent; that feature is still
outstanding.

## Fixes discovered and implemented

`src/features/academic/academic.service.ts` previously used ordinary transactions
to clear the current session and create/set another one. Concurrent transactions
could each create a current session. The first PostgreSQL test run reproduced
two current sessions for one school.

All calendar writes now use the same school transaction lock as other cooperating
school writers. Selecting a current term through create/update also selects its
parent session. Switching sessions clears current terms in other sessions.
If no term is selected for the current session, `getCurrent` returns `term: null`
instead of borrowing a term from an inactive session. Disabling the current
session clears its active term. Selecting a term remains an explicit setup step.

`src/lib/prisma.ts` now closes its externally supplied pg pool when Prisma
disconnects, so test/shutdown processes do not leave open database resources.
`src/middlewares/index.middleware.ts` no longer loads the development `.env`
when `NODE_ENV=test`.

## File map

| File | Purpose |
| --- | --- |
| `scripts/run-integration.cjs` | Private PostgreSQL lifecycle, schema-based integration tests and migration replay mode. |
| `scripts/test-database.cjs` | Explicit test URL checks and isolated child environment. |
| `prisma/seeds/index.cjs` | Deterministic two-school fixtures and guarded manual seed entry point. |
| `tests/postgres.integration.test.cjs` | Real database and HTTP integration coverage. |
| `tests/test-runner.test.cjs` | URL/environment guard regression tests. |
| `src/features/academic/academic.service.ts` | Calendar concurrency and current-term consistency fixes. |
| `src/lib/prisma.ts` | Dispose the external connection pool on disconnect. |
| `src/middlewares/index.middleware.ts` | Restrict explicit development env loading to development. |
| `package.json` | Working seed, integration/migration scripts and runner-guard tests. |

Migration replay checks a fresh installation. It does not prove that upgrading
an existing database with school data will succeed or that its data is clean.
Your application's database has not been migrated by these test runs. No
historical migration files were changed and this batch adds no new migration.

The remaining priorities are the school onboarding checklist, fee lifecycle and
retry-safe invoice generation, invitation/reset email delivery, file imports,
notification delivery, identity policy decisions and cleanup. The backend is
not yet declared ready for production deployment.
