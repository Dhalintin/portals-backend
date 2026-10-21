# SchoolOS — Backend build order

Backend-only sequence. Each step should leave **stable API contracts** before the next depends on them. Frontend stays secondary until these are solid.

---

## Phase 0 — Foundation

| #   | Feature                              | Why first                                                                          |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| 0.1 | **Prisma schema finalize + migrate** | Single source of truth (no PINs; brand/site kept)                                  |
| 0.2 | **Seed**                             | Deterministic school, roles, session/term, sample people                           |
| 0.3 | **App shell**                        | Express app, `/api/v1`, `sendSuccess` / error shape, request id, Zod, Helmet, CORS |
| 0.4 | **Config / env**                     | `APP_NAME=SchoolOS`, DB, JWT secrets, Paystack placeholders                        |
| 0.5 | **Health + version**                 | Deploy probes                                                                      |

---

## Phase 1 — Identity, tenant, access

| #   | Feature                                           | Notes                                                      |
| --- | ------------------------------------------------- | ---------------------------------------------------------- |
| 1.1 | **Auth: register / invite / login / logout**      | Password hash, activation, suspended users                 |
| 1.2 | **Auth: refresh / session policy**                | Access (+ refresh if you use it)                           |
| 1.3 | **Auth: password reset**                          | Token flow you already know                                |
| 1.4 | **JWT claims**                                    | `sub`, `globalRole`, `schoolId`, `orgRole`, permissions    |
| 1.5 | **Middleware: `authenticate`**                    | Attach `req.auth`                                          |
| 1.6 | **Middleware: `requireSchool` / platform guards** | Tenant context                                             |
| 1.7 | **RBAC: role → permission matrix**                | Code-first matrix; enforce on routes                       |
| 1.8 | **Membership CRUD (admin)**                       | Assign PROPRIETOR / PRINCIPAL / BURSAR / TEACHER / PARENT… |
| 1.9 | **Audit log writer**                              | At least login + role changes                              |

_Gate: cannot call school APIs without a valid school-scoped token._

---

## Phase 2 — School & academic calendar

| #   | Feature                                                                                  |
| --- | ---------------------------------------------------------------------------------------- |
| 2.1 | **Organization (school) profile** — get/update                                           |
| 2.2 | **Branding** — colors, logo, motto, type                                                 |
| 2.3 | **OrganizationSite** — public website content (hero, about, why-features, contact flags) |
| 2.4 | **Academic sessions** — CRUD, set current                                                |
| 2.5 | **Terms** — CRUD per session, set current                                                |
| 2.6 | **Subscription record** — create FREE on school create; read plan/cap                    |

_Gate: every school has session/term + site row._

---

## Phase 3 — Structure (classes & subjects)

| #   | Feature                                       |
| --- | --------------------------------------------- |
| 3.1 | **Classes** — CRUD (name, arm, level, active) |
| 3.2 | **Class teacher assignment**                  |
| 3.3 | **Subjects** — CRUD                           |
| 3.4 | **Class ↔ subject** links                     |
| 3.5 | **Class + subject → teacher** assignments     |

_Gate: can express “who teaches what to which class.”_

---

## Phase 4 — People

| #   | Feature                                                             |
| --- | ------------------------------------------------------------------- |
| 4.1 | **Students** — CRUD, archive, by class, admission unique per school |
| 4.2 | **Student enrollment** (per session) — optional but useful          |
| 4.3 | **Parents** — CRUD                                                  |
| 4.4 | **Parent ↔ student links**                                          |
| 4.5 | **Parent user invite / link `userId`**                              |
| 4.6 | **Staff directory** — teachers via membership + assignments         |
| 4.7 | **Excel import: students** (upload → map → validate → import)       |
| 4.8 | **Excel import: parents** (basic)                                   |
| 4.9 | **Excel export: students**                                          |

_Gate: activation path “students imported + parent connected” is possible._

---

## Phase 5 — Attendance

| #   | Feature                                                          |
| --- | ---------------------------------------------------------------- |
| 5.1 | **Mark class attendance for a date** — bulk present + exceptions |
| 5.2 | **Update single record**                                         |
| 5.3 | **List by class/date; by student history**                       |
| 5.4 | **Offline sync** — `clientKey` idempotent upsert                 |
| 5.5 | **Dashboard aggregates** — absent today, attendance %            |
| 5.6 | **Audit** — attendance modified                                  |

_Gate: teacher flow “open class → mark → save” works on API._

---

## Phase 6 — Results & report cards

| #   | Feature                                                               |
| --- | --------------------------------------------------------------------- |
| 6.1 | **Grade scale** — per school bands                                    |
| 6.2 | **Result sheet per student/term** — create/get                        |
| 6.3 | **Scores entry** — CA/exam, compute total/grade                       |
| 6.4 | **Bulk entry by class + subject**                                     |
| 6.5 | **Workflow** — DRAFT → SUBMITTED → APPROVED → PUBLISHED               |
| 6.6 | **Publish controls** — class/term; `isPublished`                      |
| 6.7 | **Positions / class summary** (if in V1)                              |
| 6.8 | **Parent-facing results read** — linked children only, published only |
| 6.9 | **Report card payload** — branded fields for PDF/frontend             |

_No PIN/card APIs._

---

## Phase 7 — Fees & invoicing

| #    | Feature                                            |
| ---- | -------------------------------------------------- |
| 7.1  | **Fee categories**                                 |
| 7.2  | **Fee structures + items** (session/term/class)    |
| 7.3  | **Generate invoices** from structure → students    |
| 7.4  | **Invoice CRUD / list** — filters, outstanding     |
| 7.5  | **Invoice status** derived from balances           |
| 7.6  | **Manual payment record** (cash, transfer, POS)    |
| 7.7  | **Payment allocation** — transactional caps        |
| 7.8  | **Receipts** — number, issue, fetch                |
| 7.9  | **Parent fees read** — children balances + history |
| 7.10 | **Bursar reports** — collected / outstanding       |

_Gate: money path works **without** Paystack._

---

## Phase 8 — Online payments (Paystack)

| #   | Feature                                                   |
| --- | --------------------------------------------------------- |
| 8.1 | **Initialize payment** — amount, student/invoice metadata |
| 8.2 | **Webhook** — signature verify, idempotent by reference   |
| 8.3 | **Server verify** with Paystack API                       |
| 8.4 | **Allocate + receipt + notify hook**                      |
| 8.5 | **Failed / pending handling**                             |

_Never trust client “success.”_

---

## Phase 9 — Communication

| #   | Feature                                                                                 |
| --- | --------------------------------------------------------------------------------------- |
| 9.1 | **Announcements** — CRUD, pin, expiry                                                   |
| 9.2 | **Notification outbox** (optional table) — types: attendance, fee, result, receipt      |
| 9.3 | **WhatsApp-ready message payloads** — text + secure links (provider can be stub)        |
| 9.4 | **Trigger points** — payment success, result publish, attendance absence (config flags) |

---

## Phase 10 — Dashboards & reports

| #    | Feature                                                                                   |
| ---- | ----------------------------------------------------------------------------------------- |
| 10.1 | **School home metrics** — students, attendance %, collected, outstanding, attention lists |
| 10.2 | **Exports** — attendance, results, fees (Excel/CSV)                                       |
| 10.3 | **PDF report data endpoints** (card/receipt)                                              |
| 10.4 | **Audit log list** (permission-gated)                                                     |

---

## Phase 11 — Platform (SchoolOS operator)

| #    | Feature                                          |
| ---- | ------------------------------------------------ |
| 11.1 | **Platform auth** — SUPER_ADMIN / PLATFORM_ADMIN |
| 11.2 | **Schools list / suspend / view**                |
| 11.3 | **Platform admin assignments**                   |
| 11.4 | **Subscriptions admin** — plan, student cap      |
| 11.5 | **Platform metrics** (lightweight)               |

---

## Phase 12 — Public (no school login)

| #    | Feature                                                 |
| ---- | ------------------------------------------------------- |
| 12.1 | **Public brand by slug** — colors, logo, site           |
| 12.2 | **Public schools directory** (optional)                 |
| 12.3 | **Public website content only** — no PIN result checker |

Parent results live behind **parent auth**, not cards.

---

## Phase 13 — Hardening

| #    | Feature                                            |
| ---- | -------------------------------------------------- |
| 13.1 | **Rate limits** — auth, webhooks, public           |
| 13.2 | **Tenant isolation tests**                         |
| 13.3 | **Payment allocation tests**                       |
| 13.4 | **Webhook tests**                                  |
| 13.5 | **File upload** safety                             |
| 13.6 | **Subscription cap enforcement** on student create |

---

## Explicitly deferred (not backend V1)

- Payroll, LMS, transport, hostel, biometrics
- Full accounting ERP
- Native apps
- Real WhatsApp Business provider (stub outbox first)
- PIN/cards (removed by product decision)

---

## Suggested milestone cuts

```text
M1  Phases 0–1     Auth + tenant + RBAC
M2  Phases 2–4     School, structure, people (+ student Excel)
M3  Phase 5        Attendance
M4  Phase 6        Results (no PINs)
M5  Phase 7        Fees manual path
M6  Phase 8        Paystack
M7  Phases 9–11    Comms, dashboards, platform
M8  Phases 12–13   Public site API + hardening
```

---

## Dependency picture

```text
Auth/RBAC/Tenant
    → School / Session / Term / Site
        → Classes / Subjects / Teachers
            → Students / Parents
                → Attendance
                → Results
                → Fees → Payments → Paystack
                    → Notifications
                    → Dashboard aggregates
```

---

**Practical start tomorrow:** Phase **0.1–0.3** + **1.1–1.7** (schema live, seed, auth, `authenticate` + `requireSchool` + `requirePermission`). Everything else builds on that.

When you’re ready to implement, say **M1** and we implement those backend modules only (routes/controller/service/validation), still no frontend.
