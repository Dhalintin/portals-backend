# Academic dashboard and staff workflow batches

## Batch 1: access boundaries (implemented)

- Principal permissions exclude fees, payments and mixed financial audit logs; academic exports check their specific data permission.
- Dashboard home and class snapshots query and return only permitted sections. Financial fields are omitted entirely for academic-only users.
- Dashboard cards, actions and owner setup checklist respect access.
- Server-side Next.js proxy verifies protected page URLs against live backend permissions. Browser storage cannot grant page access.
- One HttpOnly access credential is available for page checks. Refresh credentials remain API-scoped. Expired page sessions use the existing browser-locked refresh flow before retrying the page.
- Read-only announcement viewers see published notices without management search/filter controls. API writes and private drafts remain protected.
- Offline startup shells remain outside the online page guard; their existing local scope and retention checks remain in place.

Deploy both projects together. No database migration or new dependency is needed for this batch. Existing sessions are upgraded through the session-check screen, or users may sign in again.

## Next batches, from simpler to harder

2. **Implemented:** Staff role tabs plus a final Recent invitations tab, one email invitation action and spreadsheet upload. Navbar includes name, role, profile picture, account settings and logout. Other staff see only their own details; directory APIs enforce the same restriction. Own-account settings support name/photo updates and a current-password-verified password change that revokes every session.
3. **Implemented:** Personal read/unread announcement tracking, a navbar notification bell, read indicators for staff and parents, saved offline notice copies and queued read syncing. Desktop and parent headers stay sticky; the existing mobile school header stays sticky. Requires the new AnnouncementRead migration.
4. **Implemented:** Score entry defaults to the SchoolProvider current term and offers named school-year/term choices. One editor serves the page and results modal, with an editable desktop table, mobile cards, live totals, workflow locks and scoped device drafts. Blank marks remain null; only changed editable rows are saved in batches of up to 200.
5. Multiple roles/permissions per school membership while retaining class-teacher and subject-teacher assignment checks.
6. Exam/test timetable planner: configurable papers per day, durations, breaks and weekdays; randomized initial draft from class subjects; drag-and-drop editing with clash checks; published class views and A4 download.

The timetable image was not available in the conversation. The user's written examples define the required paper/break layout. Generated timetables must remain drafts until reviewed and published.
