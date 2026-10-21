# Seventh fix batch: dependency security and development tooling

## Changes

The initial npm audit reported 13 findings: one critical, ten high and two
moderate. The reviewed update installed successfully and reported zero findings.
This refers to the npm dependency tree and is not a deployment certification.

Changed files:

- `package.json`, `package-lock.json`: patched dependencies, scoped overrides,
  aligned Prisma versions, unused package removal and an audit command.
- `src/common/middleware/authorize.ts`: corrects a pre-existing reference to
  `req.auth.role`. The current session's `orgRole` takes precedence over an older
  `req.user` object; modern school context is supported without unsafe property
  access. This does not finish migrating every legacy controller.
- `tests/dependency-security.test.cjs`: proxy trust spoofing checks and a real
  native watch restart smoke test using a private temporary directory.
- `tests/regression.test.cjs`: current-role precedence and school-context checks.

## Dependency decisions

| Dependency | Change | Purpose |
|---|---|---|
| proxy-addr | Override to 2.0.8 | Fix the critical IPv4-mapped trust-prefix advisory |
| qs | Override to 6.16.0 | Fix parser denial-of-service advisories |
| fast-uri | Override to 3.1.8 | Fix URI normalization/security advisories |
| morgan | Update to ^1.12.1 | Fix request log injection advisories |
| @prisma/config → deepmerge-ts | Scoped override to 8.0.2 | Fix cyclic-object stack exhaustion |
| prisma → mysql2 | Scoped override to ^3.24.0; resolved 3.24.6 | Fix tooling-driver advisories |
| Prisma CLI, client, PostgreSQL adapter | Pin all three to 7.9.1 | Keep the current adapter/config/migration workflow aligned |

Prisma's config package pins an older merge library, so its patched override
crosses that library's major version. Prisma configuration loading, client
generation and database migration checks are required before trusting it in this
project. The backend remains PostgreSQL-based; this does not certify MySQL use.
Do not remove the scoped overrides during unrelated package edits without
checking whether upstream dependencies have adopted fixed versions.

Sources: [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[deepmerge-ts advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx),
[mysql2 advisory](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3),
[Morgan advisory](https://github.com/advisories/GHSA-9f6g-j8ch-79g4).

Removed unused direct packages: `import`, `jar`, `node-qpdf2`, `puppeteer`,
`qrcode`, `rate-limit-redis`, `redis`, and `@types/qrcode`. Source checks found
the PDF/PIN dependencies only in commented legacy code. Active `ioredis`,
Google authentication and express-validator helper imports are retained until
their code is migrated or deliberately removed. Applied migration history and
the legacy source files are preserved.

Removed `ts-node-dev` and `nodemon`, whose watcher dependencies contributed
unpatched findings. Do not install them again to run this backend.

## Development commands

The project requires Node >=22.15.0. Node's built-in watch mode replaces the old
watcher while preserving the compiled JavaScript workflow:

```powershell
npm run build
```

Then run these in separate terminals:

```powershell
npm run tsc
```

```powershell
npm run dev
```

`prebuild` generates Prisma before compilation, including after a clean install.
`build` still runs `tsc`; `tsc` still runs `tsc --watch`; `dev` now runs
`node --watch dist/server.js`. Loaded JavaScript dependencies are watched for
changes. Environment changes still require restarting the process. Native
watch documentation: [Node command-line API](https://nodejs.org/api/cli.html#--watch).

The updated packages are installed in this checkout. Other checkouts should
install the committed lockfile with `npm ci`. No database migration is added
by this batch. Earlier migrations remain necessary if not already applied.

## Verification commands

```powershell
npm run security:check
npm test
npm run test:integration
npm run test:migrations
npm run build
```

`security:check` audits the whole installed dependency tree and fails on
moderate-or-higher findings. Advisory results can change over time; run it
again in CI and before deployment. Zero findings does not assess the Node
runtime, operating system, application authorization, secrets or deployment.
Use a maintained Node release with current security patches in production.

Verified results: clean `npm ci` succeeded; `security:check` reported zero
vulnerabilities; all 58 regression/security tests passed; all 45 PostgreSQL
integration tests passed; all 23 migrations replayed with no schema drift; and
the sequential Prisma-generation/TypeScript build passed. Native watch was
verified by an actual file-change restart. Temporary test directories and
database servers were cleaned up.

## Remaining work

Legacy teacher/controller authentication still needs consolidation; some older
handlers use `req.user` while current sessions use `req.auth`. The current
middleware also has a credentialed wildcard CORS setting that needs a deliberate
browser-origin configuration review. These application concerns are not resolved
by a clean npm audit.

Spreadsheet imports/exports, general notification delivery, identity policy,
provider refunds and further legacy code cleanup remain. Live email provider
validation and deployment configuration are also still required.
