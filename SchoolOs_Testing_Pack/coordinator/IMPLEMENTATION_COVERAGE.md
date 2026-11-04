# SchoolOs manual test coverage

Prepared 2 November 2026. This is a manual test plan, not a record of execution.

The feature packets are written for non-technical users. Platform, outage, time-delay and money tests need a coordinator. Account credentials and real records are deliberately not supplied or created by this document task.

## Implementation sources reviewed

- Frontend app routes, role navigation and dashboard access rules in src/lib/auth/dashboardAccess.ts.
- Shared authentication, Google, invitation, profile and student sign-in screens.
- Student imports and student activation eligibility/code lifecycle.
- Parent dashboard, child-link requests and student-parent request review.
- Attendance roster and owner summaries including optional late/excused states.
- ScoreEntry, marking-scheme locking, release controls and printed reports.
- Exam timetable formats, class groups, published views and A4 export.
- Fee assignments, student balances, family checkout, manual accounts, receipt and report screens.
- Receiving bank verification and its creator/password/code/cooldown rules.
- Published notices, unread tracking, school/own-account settings.
- Offline grants, snapshots, queue handling and PWA preparation.
- Platform school, subscription, team and settings routes/screens.

## Deliberate readiness checks

Visible platform settings/new-school/billing/PIN screens are not assumed production-ready. Test persistence and cross-account behaviour; local-only success or sample rows must not pass. Approval/withdrawal UI must be operable through the app for a full result-release rehearsal. A missing control is outstanding coverage, not a successful skipped test. Public-site editing and grade-scale API configuration are not presented as normal school UI controls in this pack.

## Developer-only checks still needed

These are not tasks for the non-technical testers: tampered tokens, HttpOnly cookie inspection, cross-origin request rules, direct API validation, tenant ID substitution, database/RLS boundary checks, migration/restore/backup drills, rate-limit tuning, payment webhook signatures and replay, provider verification independent of browser return, worker crash/concurrency/lease recovery, email provider failure/retry, and server-side API-only actions not exposed in the UI (including grade-scale and parent-import APIs).

The paired privacy and payment scenarios provide user-level coverage, not a penetration test or replacement for automated server checks. In particular, prepared offline records cannot be remotely erased from a disconnected device; online sync must recheck permission.

Native React Native and Electron projects are foundations and are outside the functional scope of the current web/PWA test. Future native builds need their own install/update/storage/notification/device tests.

## Pack coverage files

feature-coverage.csv maps packets to roles and setup. test-cases.json contains the exact authored case IDs, instructions and expected outcomes for maintaining this pack. assignment-tracker.csv and problem-register.csv are blank working templates, not fabricated reports.
