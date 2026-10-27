# Owner dashboard UI batches

## Completed

1. Home, students and parents: linked school statistics; student lists are class-selected; parent lists open on request; client pagination defaults to 25.
2. Subjects and staff: visible edit/delete controls with confirmation; staff types have separate tabs and matching invitations.
3. Owner attendance and results: school-wide attendance overview and results monitoring, review, approval and per-class publication.
4. Fees and announcements: student-level fee balances and debt counts, expandable bills/receipts, and a responsive announcement noticeboard.

## Batch 3 behaviour

- Only PROPRIETOR receives the new owner views. Existing teacher attendance entry/offline queues and score entry remain available to teachers.
- Attendance tabs: today, Monday through today, and current term start through today (capped at the term end). Dates follow Africa/Lagos. Term view requires an actual configured start date.
- Attendance rate includes present plus late, divided by all recorded marks. Weekly/term numbers are student-day marks; missing records are never invented as absences.
- Result progress counts the full current active class roster and current assigned active subjects, without the old 200-report cap. This is explicitly a current-roster view, including when selecting an earlier term, rather than a historical enrollment snapshot.
- A complete student-subject score has saved CA 1, CA 2, Exam and Total. Zero is valid. Empty report shells do not count as uploaded scores.
- Owners can inspect saved scores, approve submitted complete reports, return reports for teacher work, and publish/unpublish per class with confirmation. No score-entry action is displayed to the owner.
- Existing backend workflow validation remains authoritative. Publishing releases approved reports only; draft/submitted reports stay private.
- Student reports paginate locally at 25. Overview refreshes every minute while online and has manual Refresh. Last refresh times and paused/offline notices distinguish cached figures from fresh data. Approvals/publication are never queued for automatic offline replay.

## Backend endpoints

- GET /api/v1/dashboard/attendance-overview?period=day|week|term
- GET /api/v1/dashboard/result-progress?termId=UUID

Both require authenticated active school staff and the corresponding read permission. Teacher reads remain limited to assigned classes. Foreign-school terms are rejected.

No dependencies, environment changes or database migration are needed for this batch. Rebuild/restart the backend and frontend for deployment so the new endpoints and views ship together.

## Batch 4 behaviour

- GET /api/v1/fees/student-balances requires school staff and fees:read, plus a school-owned term ID. Cancelled/draft bills are excluded; archived students retain legitimate debts.
- All valid term bills are combined per student before status filtering, bill-number/name search or pagination. Fully paid tuition plus unpaid PTA is one partly-paid student, not an unpaid student plus a paid student.
- Search matches a student or any bill number, then returns that student's complete term balance. Counts describe all billed students in the term, not just the current search/page.
- Student pagination defaults to 25; 50 and 100 are available. Open a student to view original bill items and record payment/view receipts using the existing bill-level workflow. Items are labelled as original charges because payments are allocated to bills, not individual items.
- The announcement board has a separate Important notices section for live pinned notices, readable previews, publication/expiry dates, search, filters and recent-list counts. Drafts, scheduled and expired notices are labelled separately; readers cannot see private notices.
- Reading/composing layouts use the school colours and document cards. Pin/unpin and publication controls remain available. Existing announcement visibility and scheduling rules are unchanged.
- The board explicitly covers up to 50 recent active notices including pins, rather than claiming all-time counts.

## Remaining scope

All nine items in the owner's requested UI update list are implemented across these four batches. Next is local acceptance testing as the owner and a teacher, followed by deploying the matching backend and frontend together. This UI completion does not replace deployment acceptance testing.

## Term calendar dates

School year now displays each term's start/end dates with Add dates/Edit dates controls. Both dates must be present and the end must be on/after the start before activation. Existing terms are preserved, including legacy terms awaiting dates; no date guesses or database migration are performed. New default terms remain inactive until dated and explicitly made current. Settings shows the active term boundaries.

To configure: School year -> term -> Add/Edit dates -> choose start and end -> Save dates (current term) or Save & make current (upcoming term). This term attendance counts saved records between those dates, inclusively, through today and never past the end date. Attendance records outside the range are retained. Changing the range refreshes the overview immediately.
