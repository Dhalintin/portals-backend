# Retired backend code

This directory preserves the exact source and compiled files moved out of runtime folders during batch thirteen. It contains the obsolete PIN/public checker, old school settings and academic-session APIs, old platform-admin billing implementation, stateless JWT helpers, duplicate class curriculum implementation and stale compiled modules without current source files.

These files are historical reference material. Their relative imports are not maintained, they are excluded from TypeScript compilation, and current code must not import them. Do not copy this directory into a production runtime. The supported replacements live under src/auth, src/features/academic, schools, site, platform, subscriptions and the current class/result/parent services.

No Prisma schema or migration history was archived or changed. To recover historical work, inspect the preserved file here; port any needed behavior into the current session/permission architecture rather than restoring an old router or JWT helper.
