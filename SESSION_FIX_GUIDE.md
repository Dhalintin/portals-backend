# Session lifecycle fixes

This is the second backend fix batch. It implements persistent sessions,
refresh-token rotation, logout revocation and password-reset invalidation.
It does not complete the remaining school-portal roadmap.

## Behavior

- Successful registration/login creates an `AuthSession` belonging to the user
  and school workspace. Platform sessions have no school ID.
- The database stores the SHA-256 refresh-token hash, not the raw bearer token.
- Access tokens include `sid` and `authVersion`. Every authenticated request
  checks the session, user credential version and current membership/role.
- Refresh returns a fresh access/refresh pair. The previous refresh token cannot
  be used again. A new random `jti` makes tokens distinct even within one second.
- A validly signed old refresh token with a mismatched stored hash revokes that
  session. Revocation commits before the response returns 401.
- Invalid signatures, unknown sessions and wrong-school tokens do not revoke a
  different valid session.
- Sessions have an absolute expiry, set from `JWT_REFRESH_EXPIRES` at login
  (default seven days). Refresh does not extend the session indefinitely.
- Logout revokes the selected session; logout-all revokes that user's sessions
  across devices/school workspaces and increments the credential version.
- Password reset consumes the reset token once, changes the password, increments
  the credential version, invalidates other reset tokens and revokes all user
  sessions in one transaction. Inactive accounts cannot reset passwords.
- Login/session creation, rotation, logout and resets share a user-scoped
  PostgreSQL transaction lock. A password verified just before reset/logout-all
  cannot create a session using the stale credential version afterwards.

Requests already authorized before revocation may finish; subsequent checks
reject the revoked session. No raw bearer tokens are written to logs by this code.

## API and frontend requirements

```text
POST /api/v1/auth/login         existing login body
POST /api/v1/auth/refresh       { "refreshToken": "..." }
POST /api/v1/auth/logout        Authorization: Bearer <accessToken>
POST /api/v1/auth/logout-all    Authorization: Bearer <accessToken>
POST /api/v1/auth/reset-password { "token": "...", "password": "..." }
```

Login/refresh preserve the existing response fields: `accessToken`,
`refreshToken`, `tokenType`, `user`, `school`, `orgRole` and `permissions`.
Both tokens must be replaced together after every successful refresh.

Serialize refresh calls for a shared session, including across browser tabs if
they share token storage. Two concurrent requests using the same refresh token
are treated as reuse: one may rotate first, then the second revokes the session.
Do not retry the old refresh token after a lost refresh response. On
`REFRESH_TOKEN_REUSED`, `SESSION_EXPIRED` or another refresh authentication
failure, discard the token pair and require login. A 429 is a rate-limit response,
not evidence of token revocation; back off without repeatedly rotating.

Logout endpoints require a valid access token. If it has expired, refresh once
before calling logout, or direct the user to sign in again if refresh fails.
Clear local tokens after logout; server revocation protects against reuse.

Refresh has its own rate limiter and does not consume the stricter password
login/reset attempt budget. Rate limits currently use each process's in-memory
store; distributed deployments still need a shared rate-limit store.

## Files changed

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` | `User.authVersion`, `AuthSession` and relations/indexes. |
| `prisma/migrations/20261013110000_auth_sessions/migration.sql` | Add the version column and session table; no old data is deleted. |
| `src/auth/types.ts` | Session-bound JWT claims and `req.auth.sessionId`. |
| `src/auth/jwt.ts` | Validate session claims and expiration; enforce HS256; support absolute refresh expiration. |
| `src/lib/userTransaction.ts` | Shared transaction/lock for the user's session and credential writes. |
| `src/features/auth/auth.sessions.ts` | Create, rotate, validate and revoke sessions. |
| `src/features/auth/auth.service.ts` | Use persistent sessions; reset credentials/tokens/sessions atomically. |
| `src/features/auth/auth.controller.ts` | Implement logout and logout-all. |
| `src/features/auth/auth.routes.ts` | Mount logout-all and rate-limit refresh/reset. |
| `src/middlewares/authenticate.ts` | Check session and credential version before permissions. |
| `src/middlewares/rateLimit.ts` | Separate refresh limiter. |
| `tests/auth-session.test.cjs` | Stateful regression tests plus HTTP endpoint tests. |
| `tests/regression.test.cjs` | Adapt previous auth tests to session-bound claims. |
| `package.json` | Generate Prisma client and run session tests in `npm test`. Dev/build use compiled JavaScript; batch seven replaces nodemon with Node's native watch mode. |

## Rollout

The Prisma client was regenerated locally. No dependencies were added.
The migration is prepared but has not been applied to any live database.

**Apply the session migration before starting this version of the backend.**
Old stateless JWTs are deliberately rejected; existing users must log in again.
If deploying to a staging/production database, review all pending migrations
first, including the prior payment/attendance uniqueness migration.

```powershell
npx prisma migrate deploy
npx prisma generate
npm run build
```

`migrate deploy` applies every pending migration. Test the upgrade against a
disposable database before production rollout. For local development, after
migration, keep `npm run tsc` in one terminal and `npm run dev` in another.

```powershell
npm test
```

The automated tests use explicit database doubles with modeled serialization
and rollback, and actual local HTTP endpoints. They do not contact a real
database or email provider. They verify the code paths but do not prove
PostgreSQL lock behavior or migration compatibility with existing data.

Verification completed: Prisma client generation and schema validation passed,
TypeScript compilation passed, and all 42 tests passed (22 earlier regressions
plus 20 session/password-reset/HTTP tests).

The next priority is disposable PostgreSQL integration tests and deterministic
seed data. Password-reset emails/invitation delivery remain unconnected, as do
the other items listed in `BACKEND_FIX_GUIDE.md`.
