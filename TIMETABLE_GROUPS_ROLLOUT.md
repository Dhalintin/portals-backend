# Class groups and combined timetables

Backend migration: `20261031160000_timetable_groups` adds a nullable JSON column. Existing timetables, published snapshots and versions are retained. Run `npx prisma migrate deploy`, then `npm run build` and restart the backend before deploying the updated frontend. No new dependency is needed. The shared database has not been migrated by this task.

## Using it

1. Open Timetables and choose the term and Exams or Tests.
2. Open Class groups & exceptions, choose Add group, enter its name and select its classes.
3. For example, select JSS1/JSS2 for Junior; leave JSS3 out and give it an Exam classes group. A single class can also have its own group.
4. Open Group format to set start date, papers per day, duration, breaks and weekdays.
5. Generate group timetable and confirm. Common subjects use the same slots across its classes; each class receives only the subjects it offers.
6. Review by class or in Combined view. Save draft, then publish when ready.
7. Download draft PDF or the published A4 PDF. Combined view downloads one master schedule; By class downloads class sheets.

A class belongs to at most one group. Classes outside groups use the default format. Generating that default replaces only ungrouped classes. Generating a group replaces papers for its old and selected classes; classes removed from the group need a default or new-group timetable. Removing a group removes its draft papers only after confirmation. Other groups and the current publication stay unchanged until explicitly saved/published.

Group metadata follows the existing draft version checks, atomic offline replay and published snapshot boundaries. Parent/teacher responses filter both papers and group membership to their permitted classes. Offline drafts preserve groups and formats; server permissions and class membership are checked when syncing. Term limits, clashes and the existing 500-paper cap still apply. Always review venue conflicts before publication.

## Verification

- Backend: 107 regression tests passed; production build passed.
- Frontend: full 176-test suite passed, plus the added offline group-metadata regression (all six offline transport tests passed). Production build passed.
- Three private PostgreSQL timetable integration tests passed: legacy draft/publication checks, clashes/curriculum checks, and group persistence with filtered publication metadata.
- All migrations replayed successfully and matched the Prisma schema in a private database. No shared database was changed.
- Real A4 generation passed for class sheets and combined schedules. Combined schedules retain instructions and omit breaks after the last paper.
- Fictional-data UI check: created a Junior group containing JSS1/JSS2, left JSS3 excluded, generated common-subject slots and switched to the combined view. Controls fit a 390px phone viewport without horizontal page overflow.
