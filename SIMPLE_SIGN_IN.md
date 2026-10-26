# Simple sign-in — 26 October 2026

Users enter email and password. One active school opens automatically; multiple active schools are offered by name and logo after credentials are verified. Platform operators retain their platform sign-in behavior. School-specific links continue to work without requiring users to type an identifier.

The initial multiple-school response is HTTP 409 SCHOOL_SELECTION_REQUIRED with school choices in error.details.schools. It creates no session. Choosing a school resubmits the credentials with that choice's internal schoolSlug; membership and account state are checked again before a scoped session is issued. The password stays only in the login component's memory while choosing, never in browser storage. Wrong passwords disclose no school list. Accounts without active school access receive contact-school guidance.

New school registration accepts school name without a slug and generates a unique internal identifier. Existing API clients that provide valid schoolSlug remain compatible. No database migration is needed. Branding settings keep logo editing; school name remains under School profile. Users no longer manage the internal workspace identifier.

Frontend API requests use /api/backend so the existing HttpOnly session-cookie flow continues to work. Configure BACKEND_API_URL on the frontend server, not a public browser API URL.

Verification: 89 private PostgreSQL integration tests, 64 backend regressions, 72 frontend tests, full frontend TypeScript check and both production builds passed. Direct HTTP tests through the built frontend proxy passed single-school login, multiple-school challenge without cookies, selected second-school login and browser-marker responses. Browser automation could not start because its Windows helper failed; a visual check of the new chooser remains to be completed. No hosted records, emails or migrations were changed.

Deploy the backend first, then the frontend. No dependency installation or database migration is required by this change. After deployment test one-school teacher/parent accounts and a shared account, and confirm each role reaches the correct dashboard.
