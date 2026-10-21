# MVP backend and frontend handoff

## Scope and decisions

Start frontend integration once this batch's checks pass. Live production
readiness remains a separate staging/release gate.

Include school registration/settings, calendar, classes/subjects/staff, students
and parents, invitations, attendance, results, manual payments/receipts, parent
views and announcements. Use one role per account per school. The same verified
account may belong to multiple schools with separate parent profiles. Select a
school by signing in with its schoolSlug; a dedicated switching endpoint can wait.

Defer spreadsheet file uploads (mapped JSON imports exist), WhatsApp/SMS/push,
online-payment UI/provider refunds, server PDF rendering, multiple roles within
one school, automated subscription billing and delegated platform-admin UI.
Platform assignment scope is unresolved; use school-owner administration for
this MVP. Hide deferred features. Manual payments support the initial fee flow.

## Local setup

1. Use Node 22.15+ and `npm ci` for a new checkout. No new dependencies in batch 15.
2. Configure a dedicated development DATABASE_URL, distinct JWT_ACCESS_SECRET
   and JWT_REFRESH_SECRET (32+ characters), and CORS_ORIGINS with the exact
   frontend origin. API port defaults to 4000. Keep secrets out of frontend env.
3. Run `npx prisma migrate deploy` against the intended development database,
   then `npm run build` and `npm start`. This batch has no new migration;
   earlier migrations, including the parent-per-school change, are required.
4. For development watching, run `npm run tsc` and `npm run dev` in separate
   terminals after the initial build.
5. Create a development school with POST /auth/register. The repository seed is
   guarded for test databases; it is not a production bootstrap.
6. Set WEB_URL to the frontend origin and AUTH_EMAIL_KEY to a base64 encoded
   32-byte key. Configure SMTP or Resend using AUTH_EMAIL_ENV.example. Run
   `npm run email:worker` for invitations/reset and `npm run notifications:worker`
   for announcement/event email. Use development mailboxes/provider sandboxes.
   EMAIL_PROVIDER=disabled allows non-delivery API work but sends no links.

## Shared API contract

Base URL: `http://localhost:4000/api/v1`. Authenticated requests send
`Authorization: Bearer <accessToken>`; JSON bodies send Content-Type:
application/json. Tenant identity comes from the session, not a schoolId supplied
in a query/body. GET /public/schools/:slug supplies public school branding.

Success: `{ "success": true, "data": ... }`.
Failure: `{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }`.
Details are optional. GET /health has its own `{status:"ok",message:...}` shape.

Validation may return 400 (middleware) or 422 (controller Zod); handle both.
401 means authentication/session failure; 403 means access/profile unavailable;
404 means missing/inaccessible; 409 requires resolving a conflict; 429 means
wait before retrying. Malformed JSON returns 400 INVALID_JSON and oversized
JSON returns 413 PAYLOAD_TOO_LARGE. General JSON bodies are limited to 2 MB.
X-Request-Id is exposed through CORS for frontend support references.

Pagination varies: students/parents use page + limit, teachers page + pageSize,
and some features use limit/cursor. Read each active validation file. Attendance
dates are YYYY-MM-DD; timestamps are ISO strings. Amounts ending Ngn are integer
naira. Invoice batches, manual payments and imports require idempotencyKey:
generate it once per logical operation and reuse it when retrying.

## Authentication

POST /auth/register example:
```json
{"email":"owner@example.test","password":"ExamplePassword123!","firstName":"School","lastName":"Owner","schoolName":"Example School","schoolSlug":"example-school"}
```
POST /auth/login example:
```json
{"email":"owner@example.test","password":"ExamplePassword123!","schoolSlug":"example-school"}
```
Both return data with accessToken, refreshToken, tokenType, user, school, orgRole
and permissions. GET /auth/me reloads current identity/access. Build navigation
from permissions; teachers and parents also have resource-specific restrictions.

POST /auth/refresh accepts `{refreshToken}` and rotates both tokens. Serialize
refresh across requests/tabs: old refresh-token reuse revokes the session.
Replace both together; rejected/expired refresh requires sign-in. POST
/auth/logout revokes this session; /auth/logout-all revokes all account sessions.
Tokens are returned as JSON; this API does not set auth cookies. When using a
frontend server layer, keep refresh credentials in its HttpOnly secure cookie
and proxy refresh. Keep credentials out of URLs and logs.

POST /memberships or /teachers/invite creates a pending invitation. POST
/parents/:parentId/invite accepts `{email}` only. Admin-set passwords are rejected.
Links open WEB_URL/accept-invitation#token=...; read and clear the fragment.
New accounts POST /auth/invitations/accept `{token,password}`. Existing accounts
authenticate then POST /auth/invitations/accept-existing `{token}`, or use
/auth/invitations/accept-existing-password `{token,currentPassword}`. Then sign
into the invited school. POST /auth/forgot-password `{email}` emails a reset link;
POST /auth/reset-password accepts `{token,password}` and revokes existing sessions.

## Frontend screens

All paths below are relative to /api/v1. The active routes/validation files are
the source of truth for individual forms; earlier fix guides explain complex flows.

| Screen | API entry points |
| --- | --- |
| Owner onboarding | GET /schools/onboarding; POST /schools/onboarding/complete |
| School settings | GET /schools; PATCH /schools/profile, /schools/branding |
| Calendar | GET /academic/current, /academic/sessions; session/term create/current routes |
| Classes/curriculum | GET/POST /classes, /subjects; class-subject and staffing routes |
| Staff | GET /staff, /teachers, /memberships; invitation and membership updates |
| Students | GET/POST /students; GET/PATCH /students/:studentId |
| Parents (admin) | GET/POST /parents; GET/PATCH /parents/:parentId; POST /parents/:parentId/students |
| Teacher home | GET /teachers/me/assignments; assigned classes/students |
| Attendance | GET /attendance/class?classId=...&date=...; POST /attendance/mark, /attendance/sync |
| Results | POST /results/sheets, /results/scores; PATCH /results/:id/status; POST /results/publish-class |
| Fee setup | GET/POST /fees/categories, /fees/structures |
| Invoices | POST /fees/invoices/generate; GET /fees/invoices; GET/PATCH /fees/invoices/:id |
| Manual payments | POST /fees/payments, /fees/payments/:id/allocate; GET /fees/receipts |
| Parent home | GET /parents/me; GET /academic/current |
| Parent attendance | GET /attendance/parent/students/:studentId |
| Parent results | GET /results/parent/me, /results/parent/report-cards/:id |
| Parent finances | GET /fees/parent/me (invoices and receipts) |
| Announcements | GET /communication/announcements; member reads show published active notices |
| Owner dashboard | GET /dashboard/home; reports:read required; unavailable to teachers/parents |

GET /parents/me returns the current-school contact profile and active linked
children, including children without invoices/results:
```json
{"success":true,"data":{"id":"parent-id","firstName":"Pat","lastName":"Parent","phone":null,"email":"pat@example.test","children":[{"relation":"Guardian","isPrimary":true,"student":{"id":"student-id","admissionNumber":"ADM001","firstName":"Ada","lastName":"Student","classId":"class-id"}}]}}
```
An active profile with no active children returns children:[] (200). Unlinked
or inactive profiles return NOT_A_PARENT (403): show a contact-school state.
Parents cannot use the administrative parent directory or staff payment routes.
Parent fees currently return `{children:[]}` without links and `{invoices:[...]}`
otherwise; normalize the empty state. Invisible announcement details return
data:null: show unavailable. Parent overview does not expose account credentials,
student contact fields, birth dates or other parents.

Build order: auth/school shell, owner onboarding, people/staffing, teacher
attendance/results, bursar invoices/manual payments, parent portal, announcements.
Manual people creation is sufficient for the first demo; import UI can wait.

## Acceptance and release gates

Before frontend signoff: create a school, configure calendar/classes/curriculum,
invite/accept a teacher and parent, link/enrol a child, record attendance, enter
and publish results, generate an invoice, record/allocate payment and view the
receipt as the parent. Repeat with a second school; test cross-school denial,
logout and refresh. Permissions must also be enforced by the API.

Before real users: back up/migrate staging; verify HTTPS, secrets and CORS;
actually deliver invitation/reset/event email; supervise both workers; exercise
the acceptance flow; verify database restore. Configure proxy trust/rate limits
for the chosen hosting topology. Keep online payments hidden until Paystack
test-mode/webhook checks pass. These release checks do not block frontend coding.
No live migration, provider message, payment or deployment was performed here.

## Batch fifteen verification

Passed: 58 regression tests, 84 disposable PostgreSQL integration tests and
production build with retired-module guards. New coverage includes parent
self-view before invoices/results, empty/unlinked/inactive states, cross-school
and malformed-link denial, published-announcement access and hidden notices,
malformed JSON, oversized payloads and CORS exposure of request IDs.
The scoped MVP is ready to begin frontend integration. Live release gates above
still apply; optional/deferred features do not block frontend work.

## Current checkpoint (supersedes the frontend-start recommendation above)

The user has requested final MVP backend acceptance before frontend work. See
MVP_BACKEND_ACCEPTANCE.md and RENDER_SUPABASE_DEPLOYMENT.md. The scope remains
fixed; optional features stay deferred. Hosted release checks must be recorded
as pending until actually exercised. A combined worker is now available through
npm run email:worker:all instead of running both separate email services.
