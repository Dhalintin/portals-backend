# Timetable planner — batch 6

## Prepare

1. Open Exam timetable and choose a school year/term.
2. Choose Exams or Tests. Each kind has its own draft, version, format and publication.
3. If no server/device draft exists, an example is generated from the subjects currently offered by each class. It stays private and unsaved to the school until you choose Save draft to school.
4. Open Timetable format. Choose start date/time, papers per day (1–6), paper duration (15–240 minutes), break frequency/duration and weekdays.
5. Click Generate / shuffle draft and confirm replacement. This fills each class’s papers until its subjects are exhausted, skipping excluded weekdays. It refuses an incomplete schedule if the term has too few days. It never adds a trailing break after the last daily slot.

## Review and edit

- Choose a class. Desktop shows dates as rows and papers/breaks as columns; mobile shows readable day cards.
- Drag a paper to another paper slot to move it; dropping onto an occupied slot swaps the two papers within that class.
- Tap Edit / Move for touch/keyboard controls. You can change the date, slot, subject, venue and instructions. Moving into an occupied slot swaps the papers here too.
- Add paper fills an empty slot. Removing a paper requires confirmation.
- Break slots are reserved. The server validates allowed dates, paper times, curriculum links, one paper per class/subject, class overlaps and venue clashes.
- Format changes do not silently reschedule saved papers. They apply through confirmed generation of a replacement draft.
- Existing custom timetables keep their original times until you choose to regenerate them into the daily format.

## Save and publish

- Save draft to school first. Publication is enabled only for a matching saved draft with papers.
- Publish after checking every class. Existing readers keep seeing the previous published snapshot while a new draft is edited.
- Exams and Tests publish independently. Published format/breaks are captured with the papers; saving a new format does not change the live version until republished.
- Concurrent changes return a version conflict and retain the device draft. Reload school draft requires confirmation before replacing local edits.
- Teachers receive their permitted classes; parents receive only the selected child’s class. Read-only views have no editing controls.
- Download A4 PDF creates a landscape timetable with paper and break columns, one class per page group and repeated headers when needed. Draft exports are marked DRAFT. Published and offline copies carry their status. Printed/downloaded copies cannot be recalled after withdrawal.

## Offline and limits

Device drafts and cached planning data are isolated by user, school, term and assessment kind. Opening a previously loaded plan works from a labeled offline copy for up to 24 hours. Reconnect and explicitly save/publish; drafts are not published automatically. Storage failures show an error instead of claiming a safe device save. Old exam device drafts remain recoverable under their previous key.

There is a 500-paper limit per timetable. Check subjects/curriculum before generation. The generator balances only daily slots; it does not infer teacher invigilation duties, room capacities, holidays or school-specific subject-priority rules. Managers review before publication.

## Migration and deployment

Existing timetables become EXAM plans and retain their entries/publication. The new TEST plan is separate. The format is nullable for compatibility with older custom schedules. No new dependency is required; A4 export uses the project’s existing jsPDF library.

With DATABASE_URL configured for the intended database, run in the backend before starting the new code:

```powershell
npx prisma migrate deploy
npm run build
npm run dev
```

Deploy frontend and backend together. This work does not apply migrations to shared/staging databases or publish a real school timetable.

## Acceptance checks

- Thirteen subjects with three daily papers produce five days, with the thirteenth subject alone in the last row.
- Three 120-minute papers from 08:00 with 30-minute breaks after each use 08:00–10:00, break, 10:30–12:30, break, 13:00–15:00.
- Four 120-minute papers from 08:00 with a 10-minute break after every two use 08:00–10:00, 10:00–12:00, break, 12:10–14:10, 14:10–16:10.
- Check swapping on desktop and moving through the paper dialog on mobile; no paper can occupy a break or overlap another paper for its class.
- Save Exams and Tests for the same term, publish only Exams and verify Tests remain hidden.
- Edit a published draft and verify parents keep seeing the old papers and breaks until republished.
- Check a parent with children in different classes and a Teacher with limited assignments; download only the permitted rows.
- Go offline after opening a timetable, edit, reload and reconnect. The correct kind/term’s draft should return and still require saving/publication.
- Download/print the PDF in A4 landscape and check long subject names, dates, breaks and page headers.
