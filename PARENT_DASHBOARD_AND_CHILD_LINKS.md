# Parent dashboard and child links

## Rollout

1. From portals-backend run `npx prisma migrate deploy` against the intended database. New migration: `20261101140000_child_link_requests`. This adds a table; it does not link children automatically or alter existing links.
2. Run `npm run build` and restart/deploy the backend.
3. Build/deploy portals-frontend. Installed PWA users should open online and download the workspace once to receive the new pages and saved request status.

No shared database migration was applied during development.

## Parent

- Home shows linked children and four feature shortcuts.
- My children lists linked records without expanding all features inside each child.
- Results, Fees and receipts, Exam timetable and School notices have separate pages.
- Link a child requires the child’s full name. Class and identifying notes are optional.
- Form drafts are saved per account/school. Offline submissions stay queued, explicitly marked as waiting to send, and sync through the existing authenticated outbox.
- Names never grant access. Requests stay pending until a school administrator selects the actual student and approves.
- Request status and the school’s decline explanation are visible on Link a child. A duplicate normalized name returns the existing request; for a declined request, contact the school rather than repeatedly submitting it.

## School

Parents and guardians → Child-link requests → open a request → verify the parent/child relationship using school records → search by student name/number → select the exact student → Approve child link → confirm. Decline requires an explanation. Reviews require a live connection and parents:write permission. Teacher/parent accounts cannot approve. Requests and matches are scoped to the school. Competing/double reviews return a conflict. Existing links are preserved, and a newly approved parent is not automatically made the primary guardian. Reviewer ID and decision time are stored on the request.

Parents may now be invited before children are linked, allowing them to request their own links after acceptance. The existing parent profile and invitation requirements still apply.

## Native foundations

Sibling projects: portals-mobile (React Native / Expo / TypeScript), portals-desktop (Electron). Both are starter projects; native authentication, feature screens, synchronization, packaging and releases will be separate batches. They do not change the web API URL, existing local backend or deployment settings. See each project README.

## Possible later batches (not part of this change)

1. Parent child-link decision notifications, so parents need not open the request page to check.
2. Parent attendance summaries using the existing child attendance API.
3. Shared-device privacy controls and clearer saved-work/sync status in native apps.
4. Native sign-in and offline records first, then core tasks, then signed installers/store releases.

These are follow-ups, not a commitment to expand MVP scope.

## Validation for this batch

- Frontend production build and TypeScript checks passed.
- Full frontend MVP suite: 182 tests passed, including the new offline child-link test.
- Private PostgreSQL HTTP test passed for request, duplicate retry, approve/decline, parent restrictions and cross-school denial.
- Full migration chain replayed successfully and Prisma reported no schema difference in a private disposable database.
- Test-runner safety checks: five passed.
- Browser visual verification could not run because the browser preview failed to attach after retry; no claim of screenshot verification is made.
