# Exam timetables — batch 4

## What is included

- Exam officers now open an exam workspace with score-upload progress and a timetable shortcut. Score entry appears only when they have subject teaching assignments.
- Exam-officer navigation contains Home, Results, Exam timetable and Announcements. Teacher, parent, owner and administrator views remain separate.
- Owners, school administrators, principals and exam officers can prepare and publish timetables. Teachers can read the published timetable for classes they teach or lead. Parents can read only their linked child's current class timetable.
- One timetable belongs to one school and one term. It has a private draft and a separate published snapshot.
- Editing or saving a draft does not change the published version. Publish explicitly when the revision is ready.
- Add the same exam to several classes together. The subject picker only shows subjects offered by every selected class.
- Each exam has a date, start/end times, optional venue and optional instructions. All exam dates/times follow the Lagos calendar.
- Class exams cannot overlap. Named venues cannot host different overlapping exams. Classes writing the same subject at exactly the same time may share a named venue; room capacity and invigilation are not modelled in this MVP. A blank venue means each class's classroom.
- Dates must be valid and fall within the term's configured start/end dates. Class/subject availability, dates, clashes and staff permission are checked again when publishing.
- Publishing an empty timetable is blocked. Version checks protect against stale tabs and concurrent edits. Interrupted saves/publications can safely recover the already-committed version.
- Published schedules can be printed or saved as PDF. Parents see no draft entries or draft-change metadata.
- Publication can be withdrawn with confirmation. The school draft remains available. Previously printed or offline copies cannot be recalled.

## Deployment

This batch adds `ExamTimetable` and the `exams:read`, `exams:write`, `exams:publish` permissions. No new npm dependency is required.

From the backend folder, using the intended database environment:

```powershell
npx prisma migrate deploy
npm run build
```

The migration creates a new table and leaves existing school data intact. Build generates the updated Prisma client. Restart the local backend after applying the migration, and deploy the frontend and backend together. Sign in again if the new navigation permissions have not refreshed.

New APIs, under `/api/v1`:

```text
GET  /exams/editor?termId=<uuid>                 exams:write, staff only
PUT  /exams/timetable                            exams:write, staff only
POST /exams/timetable/publish                    exams:publish, staff only
POST /exams/timetable/unpublish                  exams:publish, staff only
GET  /exams/published?termId=<uuid>               exams:read
GET  /exams/published?studentId=<child-uuid>      linked parent, current term
```

Draft saves include `expectedVersion`, `termId`, `title`, and the complete `entries` array. Each entry has an ID, class/subject IDs, `date` (`YYYY-MM-DD`), `startTime`/`endTime` (`HH:mm`), `venue` and `note`. Publish/withdraw requests include `termId` and `expectedVersion` only. Mutation permissions are rechecked inside the school transaction and changes are audited.

## Manager walkthrough

1. Open **Exam timetable** and choose the school year/term.
2. Select one or more classes.
3. Choose their shared subject.
4. Choose the exam date and start/end times.
5. Add a venue/instructions if needed, then click **Add to draft**.
6. Repeat for the remaining subjects. Use the pencil to edit a row; the bin asks for confirmation before removal.
7. Check the compact list and click **Save draft to school**.
8. Click **Publish timetable**, review the confirmation, then publish.
9. Use **View published timetable** to review or print the released version.
10. To change a published schedule, edit the draft, save, then publish again. To hide it online immediately, use **Withdraw publication**.

The school administrator must configure term dates and class subjects first. The exam officer does not need general settings access to schedule exams.

## Teacher and parent walkthrough

- Teacher: open **Exam timetable**, choose a class when multiple assigned classes are available, then view or print the published schedule.
- Parent: open the child's card, choose **Exam timetable**, then view or print that child's class schedule.
- A timetable becomes visible only after publication. An empty class schedule means no exams have been published for that class in the selected/current term.

## Offline behaviour

- Open the relevant timetable while online to save an account/school-scoped copy. Published/editor copies use the existing one-day snapshot expiry.
- Production startup prepares the public `/offline-exams` shell. It does not cache private API responses or private navigation HTML in the service worker.
- Staff can reopen **Open saved exam timetables** from the offline landing page. Parents use **Open saved parent portal** and the child's timetable tab.
- Manager edits are saved as a private device draft, separately from the server draft. Storage failures are shown explicitly; keep the page open if the device cannot save.
- Saving to school, publishing and withdrawing publication require a connection. Publication is never queued automatically.
- A version conflict preserves the device draft. Review the changes before replacing them with **Reload saved server draft**; this asks for confirmation.
- Reconnect and refresh before relying on a timetable: an offline/printed copy may predate a published revision or withdrawal. Do not clear browser storage while device-only drafts are needed.

## Acceptance checks

1. Create a draft containing two classes and confirm neither a teacher nor a parent can see it before publication.
2. Publish it. The teacher sees assigned classes; each parent sees only their linked child's class.
3. Add a draft change. The parent should continue seeing the previous published version until the change is published.
4. Try an overlapping exam for the same class, a conflicting named venue, an impossible date and a date outside the term. Each must be blocked.
5. Try adjoining exams where one ends exactly when the next starts. They should be allowed.
6. Open the same timetable in two tabs, save different edits, and confirm the second tab cannot silently overwrite the first.
7. Withdraw publication. The online parent/teacher views should no longer show a published timetable, while the manager's draft remains.
8. Save and reopen a device draft offline. Reconnect, save and publish explicitly; reconnecting alone must not publish it.
9. Confirm an exam officer without a subject assignment cannot enter that subject's scores. Assign that subject to the officer and verify their own score-entry option works.
10. Apply the migration and run these checks on staging with the role test accounts before rollout.

Automated verification uses disposable PostgreSQL and fictional users. No migration was applied to your shared database and no timetable was published on your live school portal during this code batch.
