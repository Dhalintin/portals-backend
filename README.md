# SchoolOS

> **A simple school operating system for managing students, teachers, attendance, academics, fees, payments, documents, and parent communication from one place.**

SchoolOS is a Nigeria-first, multi-tenant school operations platform designed for private schools and other educational institutions.

SchoolOS does not attempt to force schools to abandon the tools they already use. Instead, it connects existing workflows such as **WhatsApp, Excel, paper records, bank transfers, and digital payments** into a structured system.

The central product principle is:

> **Run your school without changing how your school works.**

---

# Table of Contents

- [1. Product Overview](#1-product-overview)
- [2. Product Principles](#2-product-principles)
- [3. Target Users](#3-target-users)
- [4. Core Problems](#4-core-problems)
- [5. Product Scope](#5-product-scope)
- [6. Applications](#6-applications)
- [7. V1 Scope](#7-v1-scope)
- [8. V2 Scope](#8-v2-scope)
- [9. V3 Scope](#9-v3-scope)
- [10. Features](#10-features)
- [11. User Roles and Permissions](#11-user-roles-and-permissions)
- [12. Core Workflows](#12-core-workflows)
- [13. Functional Requirements](#13-functional-requirements)
- [14. Non-Functional Requirements](#14-non-functional-requirements)
- [15. Technology Stack](#15-technology-stack)
- [16. System Architecture](#16-system-architecture)
- [17. Repository Structure](#17-repository-structure)
- [18. Backend Architecture](#18-backend-architecture)
- [19. Frontend Architecture](#19-frontend-architecture)
- [20. Database Architecture](#20-database-architecture)
- [21. Multi-Tenancy](#21-multi-tenancy)
- [22. Authentication and Authorization](#22-authentication-and-authorization)
- [23. API Standards](#23-api-standards)
- [24. Validation and Error Handling](#24-validation-and-error-handling)
- [25. Payments](#25-payments)
- [26. Notifications and Communication](#26-notifications-and-communication)
- [27. Excel Import and Export](#27-excel-import-and-export)
- [28. Attendance and Offline Support](#28-attendance-and-offline-support)
- [29. Results and Report Cards](#29-results-and-report-cards)
- [30. File and Document Management](#30-file-and-document-management)
- [31. Audit Logging](#31-audit-logging)
- [32. Search, Filtering and Pagination](#32-search-filtering-and-pagination)
- [33. Dashboard and Analytics](#33-dashboard-and-analytics)
- [34. Subscription and Billing](#34-subscription-and-billing)
- [35. Pricing Model](#35-pricing-model)
- [36. Security](#36-security)
- [37. Performance](#37-performance)
- [38. Accessibility](#38-accessibility)
- [39. Offline and Low-Connectivity Strategy](#39-offline-and-low-connectivity-strategy)
- [40. Environment Configuration](#40-environment-configuration)
- [41. API Module Structure](#41-api-module-structure)
- [42. Frontend Route Structure](#42-frontend-route-structure)
- [43. Development Workflow](#43-development-workflow)
- [44. Git Conventions](#44-git-conventions)
- [45. Testing Strategy](#45-testing-strategy)
- [46. Definition of Done](#46-definition-of-done)
- [47. Deployment](#47-deployment)
- [48. Backups and Recovery](#48-backups-and-recovery)
- [49. Observability](#49-observability)
- [50. Product Metrics](#50-product-metrics)
- [51. V1 Development Roadmap](#51-v1-development-roadmap)
- [52. V2 Development Roadmap](#52-v2-development-roadmap)
- [53. V3 Development Roadmap](#53-v3-development-roadmap)
- [54. Future Architecture Considerations](#54-future-architecture-considerations)
- [55. AI Development Rules](#55-ai-development-rules)
- [56. Engineering Constraints](#56-engineering-constraints)
- [57. Business Rules](#57-business-rules)
- [58. Acceptance Criteria](#58-acceptance-criteria)
- [59. Initial Pilot](#59-initial-pilot)
- [60. Long-Term Vision](#60-long-term-vision)

---

# 1. Product Overview

SchoolOS is a cloud-based school management and operations platform.

The system provides a centralized operating layer for:

- Students
- Parents
- Teachers
- School administrators
- Classes
- Subjects
- Attendance
- Academic results
- Report cards
- School fees
- Invoices
- Payments
- Receipts
- Payment reconciliation
- Announcements
- Notifications
- Documents
- Reports
- School subscriptions

The platform is designed primarily for Nigerian schools while keeping the architecture suitable for international expansion.

---

# 2. Product Principles

## 2.1 Simplicity First

The system must be usable by someone with limited technical experience.

A feature is not considered successful merely because it works technically.

It must also be understandable.

### Rules

- One screen should have one primary purpose.
- Common tasks should require very few interactions.
- Avoid unnecessary configuration.
- Use plain language.
- Avoid technical terminology in user-facing interfaces.
- Default to sensible settings.
- Hide advanced functionality until required.
- Avoid excessive modal dialogs.
- Avoid unnecessary multi-step forms.

---

## 2.2 Existing Workflows Are First-Class

SchoolOS must not assume schools are starting from zero.

Schools may already have:

- Excel files
- WhatsApp groups
- paper attendance
- bank transfer records
- existing student records
- existing result templates
- existing fee structures

SchoolOS must provide migration and interoperability rather than requiring schools to manually recreate everything.

---

## 2.3 No Shame-Based UX

The product must never use guilt or shame as an engagement mechanism.

Avoid language such as:

- "You failed"
- "You missed your streak"
- "You're behind"
- "Poor performance"

Prefer:

- "12 students are absent today"
- "₦2.4m remains outstanding"
- "3 result sheets need attention"

---

## 2.4 Approximation Is Better Than No Data

Where exact data is unavailable, the system should allow reasonable approximation where appropriate.

The product should not create unnecessary friction simply because a user does not have perfect information.

---

## 2.5 Numbers Are Optional Where Appropriate

Users who need detailed financial or academic information should have access to it.

Users who only need a simple overview should not be forced to interpret complex numbers.

---

## 2.6 Data Portability

Schools own their operational data.

The platform must support:

- Excel export
- CSV export where appropriate
- PDF reports
- report-card downloads
- receipts
- document downloads

The architecture must not intentionally lock schools into the platform.

---

# 3. Target Users

## 3.1 Proprietor / Owner

Needs:

- student population
- revenue
- outstanding fees
- attendance
- academic status
- staff information
- branch information
- reports

---

## 3.2 Principal / Head Teacher

Needs:

- attendance
- academics
- teachers
- students
- classes
- announcements
- reports

---

## 3.3 Bursar / Finance Officer

Needs:

- fee structures
- invoices
- payments
- receipts
- outstanding balances
- reconciliation
- financial reports

---

## 3.4 Teacher

Needs:

- assigned classes
- students
- attendance
- results
- announcements
- basic student information

Teacher UX must be optimized for mobile devices.

---

## 3.5 Parent / Guardian

Needs:

- children
- school announcements
- attendance
- results
- fees
- payment
- receipts
- school documents

Parent UX must be extremely simple and mobile-first.

---

# 4. Core Problems

Many schools operate across disconnected systems:

| Function             | Common Existing Tool |
| -------------------- | -------------------- |
| Student records      | Excel / paper        |
| Parent communication | WhatsApp             |
| Attendance           | Paper                |
| Results              | Excel / Word         |
| Fees                 | Excel / notebooks    |
| Payments             | Bank transfer / cash |
| Receipts             | Paper / WhatsApp     |
| Reports              | Manually created     |
| Documents            | Physical files       |
| Staff communication  | WhatsApp             |
| Reconciliation       | Manual               |

This causes:

- duplicated data
- lost records
- manual reconciliation
- delayed communication
- difficult reporting
- poor visibility
- unnecessary administrative work

SchoolOS connects these processes.

---

# 5. Product Scope

SchoolOS consists of six major operational domains:

```text
PEOPLE
  ├── Students
  ├── Parents
  ├── Teachers
  └── Staff

SCHOOL OPERATIONS
  ├── Sessions
  ├── Terms
  ├── Classes
  ├── Arms
  ├── Subjects
  └── Attendance

ACADEMICS
  ├── Assessments
  ├── Results
  ├── Grading
  └── Report Cards

MONEY
  ├── Fee Structures
  ├── Invoices
  ├── Payments
  ├── Receipts
  └── Reconciliation

COMMUNICATION
  ├── Announcements
  ├── WhatsApp
  ├── SMS
  ├── Email
  └── Push Notifications

DOCUMENTS & INTELLIGENCE
  ├── Files
  ├── Exports
  ├── Reports
  ├── Dashboards
  └── Analytics
```

---

# 6. Applications

The initial platform consists of two primary applications.

## 6.1 School Web Application

Used by:

- Proprietors
- Principals
- Bursars
- Teachers
- Authorized staff

Technology:

- Next.js
- React
- Tailwind CSS
- JavaScript

The application must be responsive.

---

## 6.2 Parent Web/PWA

Parents should not initially be required to install a native mobile application.

The parent experience should work through:

- mobile web
- PWA
- links received through WhatsApp/SMS/email

Native applications may be introduced later.

---

# 7. V1 Scope

V1 is the first production release.

It must include:

### School

- school setup
- school profile
- academic sessions
- academic terms
- classes
- class arms
- subjects
- staff
- teachers
- roles
- permissions

### Students

- create student
- edit student
- archive student
- search students
- filter students
- student profile
- parent relationships
- class assignment
- student history

### Parents

- parent records
- parent accounts
- child relationships
- parent dashboard

### Attendance

- daily attendance
- class attendance
- present
- absent
- late
- attendance history
- attendance summaries
- teacher attendance workflow
- offline attendance queue

### Academics

- subjects
- assessments
- CA/exam
- grading configuration
- result entry
- result calculations
- result submission
- report cards
- printable results

### Fees

- fee categories
- fee structures
- invoices
- student balances
- payment records
- receipts
- outstanding fees

### Payments

- online payment links
- payment verification
- payment webhooks
- receipts
- payment history
- manual payments
- bank-transfer reconciliation

### Communication

- announcements
- parent notifications
- WhatsApp-ready messages
- SMS architecture
- email architecture
- push notification architecture

### Data

- Excel import
- Excel export
- CSV export where appropriate
- PDF reports

### Administration

- dashboard
- role permissions
- audit logs
- school settings
- subscription management

---

# 8. V2 Scope

V2 expands SchoolOS from a school operations platform into a broader administrative system.

## 8.1 Admissions

- application forms
- applicant management
- admission pipeline
- interview scheduling
- admission decisions
- admission letters
- applicant conversion
- admission statistics

---

## 8.2 Staff Management

- staff profiles
- employment records
- staff attendance
- leave requests
- leave approval
- staff documents
- staff reporting

---

## 8.3 Payroll Preparation

Payroll should initially focus on operational records rather than becoming a full accounting system.

Features:

- salary records
- allowances
- deductions
- payroll periods
- payroll summaries
- payroll exports
- payslip generation

---

## 8.4 Expenses

- expense categories
- expense records
- receipts
- approvals
- expense reports
- monthly summaries

---

## 8.5 Inventory

- inventory items
- stock quantities
- stock movements
- suppliers
- purchase records
- low-stock alerts
- inventory reports

---

## 8.6 Timetable

- class timetable
- teacher timetable
- subject scheduling
- conflict detection
- printable timetable

---

## 8.7 Advanced Parent Communication

- communication templates
- scheduled announcements
- targeted messaging
- automated reminders
- delivery status
- communication history

---

## 8.8 Native Mobile Applications

Potential applications:

- teacher mobile application
- parent mobile application

Native applications should only be developed after real usage demonstrates a need that responsive web/PWA cannot adequately satisfy.

---

## 8.9 Multi-Campus Management

- campuses
- campus-level permissions
- campus reporting
- centralized administration
- cross-campus student records
- centralized finance reporting

---

# 9. V3 Scope

V3 expands the platform into a complete school operating ecosystem.

Potential capabilities:

## Academic

- advanced assessment systems
- curriculum management
- lesson planning
- homework
- assignments
- learning resources
- LMS integrations
- academic analytics

## Finance

- accounting integrations
- financial statements
- budgeting
- procurement
- vendor management
- advanced reconciliation
- financial forecasting

## Operations

- transport management
- hostel management
- library
- cafeteria/POS
- facility management
- asset management
- advanced inventory

## Ecosystem

- parent marketplace
- school service integrations
- educational service providers
- third-party APIs
- payment partnerships
- financial services integrations

## Intelligence

- operational analytics
- academic trend analysis
- financial analytics
- predictive reporting
- AI-assisted administrative workflows

AI must remain an assistive layer and must not replace authoritative school records.

---

# 10. Features

## 10.1 Student Management

Each student may have:

- student ID
- admission number
- first name
- middle name
- last name
- date of birth
- gender
- photo
- class
- arm
- admission date
- status
- parent/guardian relationships
- medical/emergency information where required
- academic history
- attendance history
- fee history
- documents

Student statuses:

```text
ACTIVE
INACTIVE
GRADUATED
TRANSFERRED
ARCHIVED
```

Records should generally be archived rather than permanently deleted.

---

# 11. User Roles and Permissions

The initial roles are:

```text
PROPRIETOR
PRINCIPAL
BURSAR
TEACHER
STAFF
PARENT
```

Permissions must be capability-based.

Example:

```text
students.read
students.create
students.update
students.archive

attendance.read
attendance.create
attendance.update

results.read
results.create
results.update
results.submit
results.approve

fees.read
fees.create
fees.update

payments.read
payments.create
payments.reconcile

reports.read
reports.export

users.read
users.create
users.update

settings.read
settings.update
```

Roles map to permissions.

Authorization must always be enforced on the backend.

Frontend permissions only control visibility and UX.

They are not security boundaries.

---

# 12. Core Workflows

## 12.1 School Onboarding

```text
Create account
    ↓
Create school
    ↓
Configure session
    ↓
Configure term
    ↓
Create/import classes
    ↓
Import students
    ↓
Add teachers/staff
    ↓
Assign teachers
    ↓
Configure subjects
    ↓
Configure fees
    ↓
School ready
```

---

## 12.2 Excel Student Import

```text
Upload Excel
    ↓
Read workbook
    ↓
Detect columns
    ↓
Map columns
    ↓
Preview records
    ↓
Validate records
    ↓
Show errors/warnings
    ↓
User confirms
    ↓
Import transaction
    ↓
Generate import summary
```

The import system must never silently modify data.

The user must be able to see:

- valid rows
- invalid rows
- duplicate rows
- missing fields
- mapped fields

---

## 12.3 Attendance

```text
Teacher opens class
    ↓
Select date
    ↓
All students default to PRESENT
    ↓
Teacher changes exceptions
    ↓
Save
    ↓
Queue locally if offline
    ↓
Sync when online
    ↓
Notify parents where configured
```

Primary action:

> Mark all present

Then teachers modify only exceptions.

---

## 12.4 Results

```text
Teacher
    ↓
Class
    ↓
Subject
    ↓
Term
    ↓
Enter assessment scores
    ↓
System calculates totals
    ↓
System calculates grade
    ↓
Validate
    ↓
Submit
    ↓
Authorized reviewer approves
    ↓
Report card generated
```

Result calculations must happen server-side for authoritative records.

---

## 12.5 Fee Creation

```text
Create fee structure
    ↓
Select session/term
    ↓
Select applicable classes/students
    ↓
Add fee components
    ↓
Generate invoices
    ↓
Student balance created
```

---

## 12.6 Online Payment

```text
Parent
    ↓
Select invoice
    ↓
Start payment
    ↓
Payment provider
    ↓
Provider webhook
    ↓
Backend validates webhook
    ↓
Server verifies transaction
    ↓
Create payment
    ↓
Update invoice balance
    ↓
Generate receipt
    ↓
Notify parent
```

Frontend payment success must never be treated as authoritative.

---

## 12.7 Manual Bank Transfer

```text
Payment received
    ↓
Record transaction
    ↓
System attempts student matching
    ↓
Suggested matches displayed
    ↓
Bursar confirms
    ↓
Payment linked to invoice
    ↓
Receipt generated
```

---

# 13. Functional Requirements

## FR-001 — Multi-Tenant Schools

The system must support multiple independent schools.

Each school's data must remain isolated.

---

## FR-002 — Student Records

Authorized users must be able to create, update, search, filter, archive, import, and export student records.

---

## FR-003 — Parent Relationships

A parent must be able to have multiple children.

A student may have multiple parent/guardian relationships.

Relationship types should be configurable.

---

## FR-004 — Attendance

Authorized teachers/staff must record attendance for assigned classes.

---

## FR-005 — Results

Authorized teachers must enter results only for subjects/classes they are authorized to manage.

---

## FR-006 — Financial Records

Authorized finance users must manage fee structures, invoices, payments, balances, and receipts.

---

## FR-007 — Payment Integrity

Every online payment must be verified server-side.

Webhook processing must be idempotent.

---

## FR-008 — Notifications

Notifications must be asynchronous and must not block core transactional operations.

---

## FR-009 — Data Export

Schools must be able to export supported records.

---

## FR-010 — Auditability

Important actions must be recorded.

---

# 14. Non-Functional Requirements

## Reliability

Critical financial and academic operations must be transactional.

## Security

Sensitive data must be protected in transit and at rest where applicable.

## Performance

The application should remain responsive on low-to-mid-range devices and slower Nigerian network conditions.

## Scalability

The system must support increasing numbers of:

- schools
- students
- users
- payments
- notifications
- records

without requiring a fundamental architectural rewrite.

## Maintainability

Business logic must not be duplicated between controllers and frontend components.

## Observability

Production errors, failed jobs, payment failures, and critical synchronization issues must be traceable.

---

# 15. Technology Stack

## Frontend

```text
Next.js
React
JavaScript
Tailwind CSS
```

The frontend uses the Next.js App Router.

---

## Backend

```text
Node.js
Express.js
JavaScript
Prisma
PostgreSQL
```

---

## Storage

S3-compatible object storage.

Examples include:

- Amazon S3
- Cloudflare R2
- compatible providers

Storage provider must be abstracted behind a storage service.

---

## Payments

Primary payment provider:

```text
Paystack
```

Payment-provider-specific logic must be isolated inside the payment integration layer.

---

## Communication

Architecture should support:

```text
WhatsApp
SMS
Email
Push Notifications
```

Providers must be abstracted where practical.

---

## Authentication

Session/token strategy must be centralized.

Authentication implementation must not be duplicated across modules.

---

# 16. System Architecture

```text
                    ┌──────────────────────┐
                    │      Parent PWA      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │      School Web      │
                    └──────────┬───────────┘
                               │
                         HTTPS / API
                               │
                    ┌──────────▼───────────┐
                    │     Express API      │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
 ┌──────▼──────┐       ┌───────▼──────┐       ┌──────▼──────┐
 │   Services  │       │ Repositories  │       │ Background  │
 │             │       │              │       │ Jobs        │
 └──────┬──────┘       └───────┬──────┘       └──────┬──────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                       ┌───────▼────────┐
                       │    Prisma      │
                       └───────┬────────┘
                               │
                       ┌───────▼────────┐
                       │  PostgreSQL    │
                       └────────────────┘

External services:

PostgreSQL
S3 Storage
Paystack
WhatsApp Provider
SMS Provider
Email Provider
```

---

# 17. Repository Structure

```text
schoolos/
│
├── apps/
│   │
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── utils/
│   │   └── public/
│   │
│   └── api/
│       └── src/
│           ├── config/
│           ├── middleware/
│           ├── modules/
│           ├── routes/
│           ├── jobs/
│           ├── lib/
│           ├── utils/
│           └── app.js
│
├── packages/
│   ├── ui/
│   ├── validation/
│   ├── constants/
│   └── utils/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.js
│
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── business-rules.md
│   ├── onboarding.md
│   └── deployment.md
│
├── tests/
│
├── .env.example
├── package.json
├── README.md
└── .gitignore
```

---

# 18. Backend Architecture

Backend modules follow:

```text
Route
  ↓
Middleware
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Prisma
  ↓
PostgreSQL
```

## Route

Responsible for:

- URL definition
- HTTP method
- middleware attachment

Routes should contain minimal business logic.

---

## Controller

Responsible for:

- receiving request
- extracting validated data
- calling service
- returning response

Controllers must not contain complex business logic.

---

## Service

Responsible for:

- business rules
- workflows
- transactions
- orchestration
- external service coordination

---

## Repository

Responsible for:

- database access
- Prisma queries
- persistence-specific logic

Business rules should not be placed inside repositories.

---

# 19. Frontend Architecture

Frontend features should be organized by domain.

Example:

```text
features/
├── students/
├── attendance/
├── results/
├── fees/
├── payments/
├── parents/
├── teachers/
├── classes/
├── announcements/
└── reports/
```

Each feature may contain:

```text
components/
hooks/
services/
utils/
constants/
```

Shared UI belongs in:

```text
packages/ui
```

Business-specific components should remain inside their feature.

---

# 20. Database Architecture

PostgreSQL is the source of truth for persistent operational data.

Core entities include:

```text
School
User
Role
Permission
UserRole
Student
Parent
ParentStudent
Teacher
Staff
Session
Term
Class
ClassArm
Subject
TeacherSubject
StudentEnrollment
Attendance
AttendanceRecord
Assessment
Result
GradeScale
FeeCategory
FeeStructure
Invoice
InvoiceItem
Payment
PaymentAllocation
Receipt
Announcement
Notification
File
AuditLog
Subscription
SubscriptionPlan
```

Additional entities may be introduced only when justified by a concrete requirement.

---

# 21. Multi-Tenancy

SchoolOS is multi-tenant from V1.

Every school-owned record must include a school scope.

Example:

```text
schoolId
```

Tenant isolation must be enforced at the backend.

Never rely on:

```text
frontend filtering
```

for tenant isolation.

Every repository query involving school-owned records must enforce the appropriate tenant scope.

Example conceptual pattern:

```text
findStudent({
    schoolId,
    studentId
})
```

not:

```text
findStudent({
    studentId
})
```

unless the operation is explicitly global.

Cross-school data access is prohibited unless explicitly implemented for a system-level administrative function.

---

# 22. Authentication and Authorization

Authentication identifies the user.

Authorization determines what the user can do.

These concerns must remain separate.

## Authentication requirements

- secure password handling
- secure sessions/tokens
- session expiration
- logout
- password reset
- email/phone verification where required
- login protection
- rate limiting

## Authorization requirements

Every protected API endpoint must verify:

1. authenticated user
2. active account
3. school membership
4. role/permission
5. resource ownership/scope

---

# 23. API Standards

API base:

```text
/api/v1
```

Example:

```text
GET    /api/v1/students
GET    /api/v1/students/:id
POST   /api/v1/students
PATCH  /api/v1/students/:id
POST   /api/v1/students/:id/archive
```

---

## Response format

Successful response:

```json
{
  "success": true,
  "data": {}
}
```

Paginated response:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "STUDENT_NOT_FOUND",
    "message": "Student not found"
  }
}
```

Error codes must be stable.

Frontend code should not depend on parsing human-readable error messages.

---

# 24. Validation and Error Handling

All externally supplied data must be validated.

Validation applies to:

- request bodies
- query parameters
- route parameters
- imported files
- webhook payloads
- external provider responses

Validation should occur before business logic.

Errors must be categorized.

Example:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
PAYMENT_ERROR
EXTERNAL_SERVICE_ERROR
INTERNAL_ERROR
```

Production responses must not expose:

- stack traces
- database internals
- secrets
- provider credentials
- internal implementation details

---

# 25. Payments

Paystack is the primary payment provider for V1.

The payment architecture must remain provider-agnostic.

Conceptually:

```text
PaymentService
      ↓
PaymentProvider
      ↓
PaystackProvider
```

This allows future providers to be added without rewriting financial logic.

---

## Payment lifecycle

```text
INITIATED
PENDING
SUCCESSFUL
FAILED
REFUNDED
```

Payment records must contain sufficient information to trace:

- student
- parent
- school
- invoice
- provider
- provider transaction reference
- amount
- currency
- status
- timestamps

---

## Webhook requirements

Webhook processing must be:

- authenticated
- validated
- idempotent
- logged
- transaction-safe

Repeated webhook events must not create duplicate payments.

---

## Payment allocation

A payment may be allocated against one or more invoice items.

The system must maintain:

```text
invoice total
amount paid
amount outstanding
```

These values must be calculated consistently.

---

# 26. Notifications and Communication

Notification architecture:

```text
Application Event
      ↓
Notification Service
      ↓
Queue
      ↓
Provider
```

Supported channels:

```text
WHATSAPP
SMS
EMAIL
PUSH
IN_APP
```

Examples:

- attendance notification
- fee reminder
- payment confirmation
- receipt notification
- result notification
- announcement

Core school operations must not fail merely because a notification provider is unavailable.

---

# 27. Excel Import and Export

Excel import is a major adoption feature.

The system must support existing school spreadsheets.

## Import pipeline

```text
Upload
→ Parse
→ Detect headers
→ Map
→ Preview
→ Validate
→ Confirm
→ Import
→ Summary
```

Supported initial imports:

- students
- teachers
- parents
- classes
- subjects

Future imports:

- fees
- results
- attendance
- expenses

---

## Import validation

Potential errors:

- missing required field
- duplicate admission number
- invalid date
- invalid class
- invalid gender
- invalid parent relationship
- invalid numeric value

Rows with errors must be clearly identified.

---

# 28. Attendance and Offline Support

Teacher attendance is optimized for unreliable connectivity.

The frontend maintains a local queue for attendance mutations.

Conceptual structure:

```text
Local Attendance Action
      ↓
Local Queue
      ↓
Network Available
      ↓
Sync
      ↓
API
      ↓
Server Confirmation
      ↓
Remove From Queue
```

Sync operations must be idempotent.

Each offline action should have a unique client-generated identifier.

The server must prevent duplicate application of the same action.

---

# 29. Results and Report Cards

Schools may configure grading systems.

Example:

```text
A = 70–100
B = 60–69
C = 50–59
D = 45–49
E = 40–44
F = 0–39
```

The exact grading scale must not be hard-coded.

A school may configure:

- score ranges
- grade letters
- grade descriptions
- grade points
- pass/fail thresholds

Result calculation must be deterministic.

Example:

```text
CA + Examination = Total
```

The exact weighting must be configurable.

---

## Result states

```text
DRAFT
SUBMITTED
APPROVED
PUBLISHED
```

Published results should not be silently modified.

Changes to published results require authorization and must be audited.

---

# 30. File and Document Management

Documents may include:

- student photos
- school logos
- report cards
- receipts
- admission letters
- staff documents
- uploaded spreadsheets

Binary files must not be stored directly inside PostgreSQL.

Store objects in S3-compatible storage.

Database stores metadata:

```text
id
schoolId
fileName
mimeType
size
storageKey
uploadedBy
createdAt
```

Access must be authorized.

Private files should use signed URLs or an equivalent controlled-access mechanism.

---

# 31. Audit Logging

Audit logs are required for sensitive operations.

Examples:

```text
STUDENT_CREATED
STUDENT_UPDATED
STUDENT_ARCHIVED

RESULT_SUBMITTED
RESULT_APPROVED
RESULT_PUBLISHED
RESULT_MODIFIED

INVOICE_CREATED
PAYMENT_CREATED
PAYMENT_RECONCILED
PAYMENT_REFUNDED

USER_CREATED
USER_ROLE_CHANGED

SETTINGS_UPDATED
```

Audit records should contain:

```text
id
schoolId
actorId
action
entityType
entityId
metadata
ipAddress
userAgent
createdAt
```

Sensitive values should not be unnecessarily stored inside audit metadata.

---

# 32. Search, Filtering and Pagination

Default pagination:

```text
20 records per page
```

The API must support:

- page
- limit
- search
- filters
- sorting

Example:

```text
GET /api/v1/students?page=1&limit=20&search=john
```

Large collections must not be returned without pagination.

Search should use database indexes where appropriate.

---

# 33. Dashboard and Analytics

The administrator dashboard should answer:

1. How many students are enrolled?
2. Who is absent?
3. How much has been collected?
4. How much remains outstanding?
5. What needs attention?

Example:

```text
728 Students
94% Attendance
₦18.4m Collected
₦4.2m Outstanding
12 Absent
8 Payments Need Matching
3 Result Sheets Incomplete
```

Dashboard cards should be actionable.

Example:

```text
12 students absent today
→ View attendance
```

Analytics should prioritize operational usefulness over decorative charts.

---

# 34. Subscription and Billing

SchoolOS uses school subscriptions for premium functionality.

Plans are associated with:

- student limits
- feature entitlements
- usage limits
- billing period
- sponsorship model

The entitlement system must be centralized.

Do not scatter plan checks throughout components.

Use a central capability model.

Example:

```text
canUse("advanced_reconciliation")
canUse("bulk_whatsapp")
canUse("multi_campus")
```

---

# 35. Pricing Model

Initial proposed pricing:

| Plan       | Student Limit |         Price |
| ---------- | ------------: | ------------: |
| Free       |           100 |            ₦0 |
| Starter    |           250 |  ₦25,000/term |
| Growth     |           600 |  ₦50,000/term |
| Pro        |         1,500 | ₦100,000/term |
| Enterprise |        1,500+ |        Custom |

Pricing is configurable and must not be hard-coded into business logic.

---

## Sponsorship Models

SchoolOS supports:

### School Sponsored

School pays.

Parents pay ₦0 for included services.

### Parent Sponsored

Parent pays for applicable services.

### Shared

School pays for core services while parents may pay for optional services.

Charges must be transparent.

SchoolOS must not encourage schools to disguise platform charges as school fees.

---

# 36. Security

Security is a core product requirement.

## Required controls

- HTTPS
- secure authentication
- password hashing
- authorization middleware
- tenant isolation
- input validation
- rate limiting
- secure HTTP headers
- CSRF protection where applicable
- secure cookies where applicable
- webhook verification
- secret management
- audit logging
- database backups
- least-privilege access

---

## Sensitive information

Do not expose:

- passwords
- authentication tokens
- payment secrets
- provider credentials
- internal database identifiers unnecessarily
- private files without authorization

---

# 37. Performance

Targets:

- fast initial load
- responsive navigation
- minimal unnecessary API requests
- efficient database queries
- indexed common queries
- paginated large datasets
- optimized images
- compressed responses
- caching where appropriate

Target normal application interactions should feel immediate on mid-range Android devices.

---

# 38. Accessibility

Minimum touch target:

```text
44px
```

or approximately:

```text
48dp
```

The application must not communicate meaning using color alone.

Example:

Incorrect:

```text
red = absent
green = present
```

without labels.

Correct:

```text
✓ Present
✕ Absent
◷ Late
```

Keyboard navigation should be supported for desktop workflows.

---

# 39. Offline and Low-Connectivity Strategy

The system is cloud-backed but must tolerate temporary connectivity loss.

Priority offline capability:

1. Teacher attendance
2. Basic teacher workflows
3. Draft results where appropriate

The authoritative source of truth remains the backend database.

Offline data must eventually synchronize with the server.

Conflict handling must be deterministic.

---

# 40. Environment Configuration

Example:

```env
NODE_ENV=development

DATABASE_URL=

API_URL=
NEXT_PUBLIC_API_URL=

AUTH_SECRET=

S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=

WHATSAPP_API_URL=
WHATSAPP_API_TOKEN=

SMS_API_URL=
SMS_API_KEY=

EMAIL_API_URL=
EMAIL_API_KEY=
```

Secrets must never be committed to Git.

`.env.example` must contain variable names but no production secrets.

---

# 41. API Module Structure

Backend modules:

```text
auth
schools
users
roles
permissions

students
parents
teachers
staff
classes
subjects
sessions
terms

attendance
results
grading

fees
invoices
payments
receipts
reconciliation
expenses

announcements
notifications
messages

files
reports
exports

subscriptions
billing

auditLogs
```

Each module should follow a consistent structure.

Example:

```text
students/
├── student.routes.js
├── student.controller.js
├── student.service.js
├── student.repository.js
├── student.validation.js
├── student.constants.js
└── student.utils.js
```

---

# 42. Frontend Route Structure

Conceptual structure:

```text
/
├── login
├── register
├── onboarding
│
├── dashboard
│
├── students
│   ├── page
│   ├── new
│   └── [id]
│
├── academics
│   ├── classes
│   ├── subjects
│   ├── attendance
│   ├── results
│   └── report-cards
│
├── fees
│   ├── structures
│   ├── invoices
│   ├── payments
│   ├── reconciliation
│   └── receipts
│
├── messages
│   ├── announcements
│   └── history
│
├── reports
│
├── staff
│
├── settings
│
└── parent/
    ├── dashboard
    ├── children
    ├── fees
    ├── results
    ├── attendance
    └── announcements
```

Actual routing may evolve while preserving domain boundaries.

---

# 43. Development Workflow

Development should follow vertical feature slices.

A feature is considered complete only when:

```text
Database
+
Backend
+
Validation
+
Authorization
+
Frontend
+
Error handling
+
Tests
+
Documentation
```

are implemented where applicable.

Example:

```text
Student Import
```

should not mean only creating an upload button.

It includes:

```text
upload
→ parse
→ validate
→ preview
→ confirm
→ import
→ database transaction
→ audit log
→ result summary
```

---

# 44. Git Conventions

Branch naming:

```text
feature/student-import
feature/attendance
feature/payment-webhook

fix/payment-duplicate
fix/attendance-sync

refactor/payment-service
```

Commit style:

```text
feat: add student excel import
feat: implement attendance recording
feat: add payment webhook verification

fix: prevent duplicate payment processing
fix: correct invoice balance calculation

refactor: extract payment provider interface
```

Pull requests should describe:

- problem
- implementation
- affected modules
- database changes
- API changes
- testing performed
- migration requirements

---

# 45. Testing Strategy

Testing priorities:

## Critical

- authentication
- authorization
- tenant isolation
- payment processing
- payment webhooks
- invoice calculations
- payment allocation
- result calculations
- Excel imports
- offline synchronization

## Important

- student CRUD
- attendance
- parent relationships
- report cards
- notifications

## UI

- critical user workflows
- responsive behavior
- form validation
- loading/error states

---

## Test layers

```text
Unit Tests
Integration Tests
API Tests
Database Tests
End-to-End Tests
```

The system should prioritize business-critical tests over superficial test coverage.

---

# 46. Definition of Done

A feature is complete when:

- requirements are implemented
- database migrations are included
- backend validation exists
- authorization exists
- tenant isolation is enforced
- API endpoint works
- frontend workflow works
- loading states exist
- error states exist
- empty states exist
- mobile layout works
- relevant tests pass
- audit logging exists where required
- documentation is updated
- no secrets are committed
- lint/build succeeds

---

# 47. Deployment

Initial production architecture:

```text
                    Internet
                       │
             ┌─────────▼─────────┐
             │   Next.js Web      │
             └─────────┬─────────┘
                       │
                    HTTPS
                       │
             ┌─────────▼─────────┐
             │  Express API      │
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │   PostgreSQL      │
             └───────────────────┘

External:

S3-compatible storage
Paystack
WhatsApp
SMS
Email
```

Frontend and API may initially be deployed separately.

Infrastructure should remain simple until actual usage requires more complexity.

---

# 48. Backups and Recovery

Production database backups are mandatory.

Requirements:

- automated backups
- backup retention policy
- periodic restore testing
- database migration history
- disaster recovery procedure

A backup that has never been restored/tested should not be considered verified.

---

# 49. Observability

Production system should provide visibility into:

- API errors
- authentication failures
- failed payments
- webhook failures
- notification failures
- synchronization failures
- database errors
- slow API requests
- background job failures

Critical events should be logged with correlation/request IDs where practical.

Logs must not contain secrets or unnecessary sensitive information.

---

# 50. Product Metrics

The primary product metric is:

> **Active Schools Successfully Completing a Full School Workflow**

A school is considered activated when it has completed:

```text
Students imported
        +
Teacher added
        +
Attendance recorded
        +
Result entered
        +
Parent connected
        +
Fee/payment record created
```

Supporting metrics:

- schools onboarded
- active schools
- students managed
- teachers active
- parents connected
- attendance records created
- results submitted
- invoices created
- payments processed
- payment reconciliation rate
- notification delivery rate
- export usage
- retention
- subscription conversion
- support requests

---

# 51. V1 Development Roadmap

## Week 1 — Foundation

### Backend

- Node.js
- Express
- Prisma
- PostgreSQL
- environment configuration
- error handling
- logging
- validation
- project structure

### Frontend

- Next.js
- Tailwind
- routing
- application shell
- reusable components
- authentication shell

### Infrastructure

- GitHub
- development database
- deployment environments
- object storage

---

## Week 2 — Authentication and School Setup

- registration
- login
- logout
- sessions
- password reset
- school creation
- school profile
- staff invitations
- roles
- permissions

---

## Week 3 — Students and Excel

- student CRUD
- student search
- filtering
- archive
- parent relationships
- Excel import
- import preview
- validation
- Excel export

---

## Week 4 — Classes, Teachers and Attendance

- sessions
- terms
- classes
- arms
- subjects
- teachers
- teacher assignments
- attendance
- offline attendance queue

---

## Week 5 — Results

- grading configuration
- assessments
- CA/exam
- result entry
- calculations
- result validation
- result submission
- report cards

Pilot demonstrations should begin at this stage.

---

## Week 6 — Fees

- fee categories
- fee structures
- invoices
- invoice items
- student balances
- outstanding fees
- finance dashboard

---

## Week 7 — Payments

- payment initialization
- Paystack integration
- webhook handling
- server verification
- receipts
- payment history
- manual payments
- reconciliation

---

## Week 8 — Parents and Communication

- parent accounts
- child linking
- parent dashboard
- announcements
- notification service
- WhatsApp integration architecture
- SMS/email architecture

---

## Week 9 — Dashboard and Billing

- operational dashboard
- reports
- analytics
- subscriptions
- plan limits
- sponsorship model

---

## Week 10 — Production Hardening

- security review
- authorization audit
- tenant isolation audit
- payment testing
- backup verification
- performance testing
- error handling
- documentation
- deployment
- pilot preparation

---

# 52. V2 Development Roadmap

V2 should prioritize features that increase school retention and operational depth.

Suggested order:

```text
Admissions
    ↓
Advanced Staff Management
    ↓
Expenses
    ↓
Payroll Preparation
    ↓
Timetable
    ↓
Inventory
    ↓
Advanced Communication
    ↓
Multi-Campus
    ↓
Native Teacher/Parent Apps
```

---

# 53. V3 Development Roadmap

V3 should focus on ecosystem expansion.

```text
Accounting
    ↓
Procurement
    ↓
Transport
    ↓
Hostel
    ↓
Library
    ↓
Cafeteria
    ↓
Advanced LMS
    ↓
Integrations
    ↓
Marketplace
    ↓
Advanced Intelligence
```

The actual V3 roadmap should be driven by validated customer demand rather than assumptions.

---

# 54. Future Architecture Considerations

The V1 architecture should avoid premature microservices.

Initial architecture:

```text
Modular Monolith
```

The backend should remain a single deployable service while maintaining strong internal module boundaries.

Potential future extraction:

```text
API
├── Core School Operations
├── Payments
├── Notifications
├── Files
├── Reporting
└── Analytics
```

Services should only be separated when there is a clear operational or scaling requirement.

---

# 55. AI Development Rules

SchoolOS will be developed with AI-assisted coding.

AI-generated code must follow the existing architecture.

## AI must not:

- introduce TypeScript unless explicitly requested
- replace JavaScript with TypeScript
- replace Express with another backend framework
- replace PostgreSQL
- replace Prisma
- introduce MongoDB
- introduce Firebase as the primary database
- introduce Redux unless explicitly required
- introduce a new state-management library without approval
- replace Next.js
- rewrite existing modules unnecessarily
- modify unrelated files
- change database architecture without explicit approval
- create duplicate services
- bypass authorization
- bypass tenant isolation
- put business logic inside controllers
- put business logic inside React components
- call Prisma directly from controllers
- trust frontend payment confirmation
- process payment webhooks without idempotency
- hard-code school IDs
- hard-code user IDs
- hard-code production credentials
- silently change existing API contracts

---

## AI implementation protocol

Before generating code, an AI coding agent should:

1. Inspect the repository.
2. Inspect existing architecture.
3. Identify the relevant module.
4. Inspect existing models.
5. Inspect related services.
6. Inspect existing API conventions.
7. Inspect existing frontend conventions.
8. Identify dependencies.
9. Make the smallest required change.
10. Preserve existing behavior.
11. Add tests where required.
12. Report files changed.

The AI should not rewrite an existing system simply because it prefers another architecture.

---

# 56. Engineering Constraints

The following constraints are architectural requirements.

## Backend

```text
Node.js
Express
JavaScript
Prisma
PostgreSQL
```

## Frontend

```text
Next.js
React
JavaScript
Tailwind CSS
```

## Database

```text
PostgreSQL
```

## Architecture

```text
Modular monolith
```

## Storage

```text
S3-compatible object storage
```

## Payments

```text
Provider abstraction
Paystack implementation
```

---

## Code style

Prefer:

- readable code
- small functions
- explicit naming
- predictable control flow
- reusable services
- centralized validation
- centralized authorization
- consistent response structures

Avoid:

- clever abstractions without need
- premature optimization
- unnecessary dependencies
- duplicated business logic
- giant components
- giant services
- giant controllers
- circular dependencies

---

# 57. Business Rules

## Student

A student belongs to exactly one school.

A student may have multiple parent/guardian relationships.

A student should generally be archived instead of permanently deleted.

---

## Parent

A parent may have multiple children.

A parent may have different relationships with each child.

---

## Attendance

Attendance belongs to:

```text
school
session
term
date
class
student
```

A student should have at most one authoritative attendance record for a given attendance context unless the data model explicitly supports multiple sessions per day.

---

## Results

Results belong to:

```text
school
session
term
student
subject
assessment
```

Published results require controlled modification.

---

## Fees

An invoice belongs to a student and school.

Invoice totals must equal the sum of invoice items.

Outstanding balance:

```text
invoice total - allocated payments
```

The system must not allow allocated payments to exceed the applicable amount unless overpayments are explicitly supported.

---

## Payments

Every payment must belong to a school.

Online payments must have a provider reference.

Payment processing must be idempotent.

A provider webhook may not create duplicate financial records.

---

## Tenant Isolation

Every school-owned resource must be scoped to the authenticated user's school.

---

## Audit

Sensitive mutations must be auditable.

---

# 58. Acceptance Criteria

## Student Management

A school administrator can:

```text
Create student
Edit student
Search student
Filter student
View student
Assign class
Link parent
Archive student
Export students
```

---

## Attendance

A teacher can:

```text
Open assigned class
Select date
Mark all present
Change exceptions
Save attendance
Continue offline
Synchronize later
```

---

## Results

A teacher can:

```text
Open class
Select subject
Select term
Enter scores
Submit result
```

The system calculates the configured grade correctly.

---

## Fees

A bursar can:

```text
Create fee structure
Generate invoice
View student balance
Record payment
Generate receipt
View outstanding balance
```

---

## Online Payment

A parent can:

```text
View invoice
Start payment
Complete payment
Return to SchoolOS
View updated balance
View receipt
```

The backend verifies the transaction independently.

---

## Parent

A parent can:

```text
Log in
View children
View attendance
View results
View fees
Pay fees
View receipts
Read announcements
```

---

# 59. Initial Pilot

The initial pilot should involve approximately:

```text
3–10 schools
```

The pilot should include different school sizes.

Example:

```text
100 students
250 students
500 students
1,000+ students
```

The objective is not simply to collect opinions.

The system should be tested against real workflows.

A pilot school should be able to independently complete:

```text
Excel Import
      ↓
Student Management
      ↓
Teacher Assignment
      ↓
Attendance
      ↓
Results
      ↓
Fee Setup
      ↓
Payment
      ↓
Receipt
      ↓
Parent Notification
```

---

# 60. Long-Term Vision

SchoolOS should evolve from a school management application into a school operating infrastructure layer.

The long-term platform can connect:

```text
Students
Parents
Teachers
Schools
Payments
Communication
Academics
Finance
Documents
Operations
External Services
```

The goal is not to replace every tool used by schools.

The goal is to make the important parts of school operations work together.

The product should remain:

- simple
- reliable
- affordable
- accessible
- mobile-friendly
- low-bandwidth friendly
- data-portable
- operationally useful

The fundamental product promise remains:

> **Your school already has WhatsApp, Excel, paper and bank transfers. SchoolOS simply makes them work together.**

---

# Project Status

## Current Phase

```text
PRODUCT / ARCHITECTURE DEFINITION
```

## Target

```text
Production-ready V1
```

## Primary Market

```text
Nigeria
```

## Initial Architecture

```text
Next.js
React
Tailwind CSS
        +
Node.js
Express
Prisma
PostgreSQL
        +
S3-compatible storage
        +
Paystack
```

## Architectural Pattern

```text
Modular Monolith
```

## Data Strategy

```text
Cloud-backed
Multi-tenant
PostgreSQL source of truth
Offline-capable teacher workflows
```

## V1 Principle

> **Build the smallest complete school operating system, not the largest collection of school features.**
