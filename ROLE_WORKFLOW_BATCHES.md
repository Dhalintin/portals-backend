# Role workflow improvements

## Batch 1 — assignment-based entry
- Attendance writes (including offline sync) require the current class teacher assignment.
- Score writes require the current subject assignment, including for managers and exam officers.
- Managers open attendance/results monitoring first; assigned teaching work remains accessible.
- Assignment-only entry pickers do not change the broader class management lists.
- Result review, approval and publishing keep their existing manager permissions.
- No database migration or dependency installation.

## Batch 2 — parent payments and portal colours
- Navy/gold parent portal, compact fee item selection, per-child combined checkout.
- Parent-scoped server-calculated checkout, school collection routing, item allocation snapshots and printable receipts.
- Saved bills/receipts, checkout recovery and a public offline parent shell.
- Requires the fee item migration and Paystack configuration described in PARENT_PAYMENTS.md.

## Batch 3 — bursar finance workflow
- Bursar home/fees overview with collection, daily and class-balance charts.
- One received payment across a student's bills; detailed printable receipts.
- Complete CSV/print debtor, paid-student and unallocated-credit reports.
- IndexedDB payment queue, automatic reconnect sync, safe retries and explicit stale-balance review.
- Public offline finance shell; see BURSAR_WORKFLOW.md for preparation and storage limits.
- No additional migration or dependency beyond batch 2 prerequisites.

## Batch 4 — exam officer workflow and timetables
- Exam-focused home/navigation, keeping school-wide score-upload progress and assignment-only score entry.
- Multi-class timetable drafts, term/date/curriculum and clash checks, version protection and explicit publication/withdrawal.
- Published teacher/parent views, printing and scoped offline copies/device drafts.
- Requires the exam timetable migration; see EXAM_TIMETABLES.md.

## Next step
The four requested role workflow batches are implemented. Apply pending migrations, deploy both projects, then run the documented staging acceptance checks using each role. Live staging/payment/browser acceptance is still required before rollout.

Deploy backend and frontend together for batch 1: the frontend uses GET /staff/me/assignments.
