# Score entry — batch 4

## Changes

- The score-entry page uses named school year/term options and defaults to the SchoolProvider current term. Teachers no longer paste term IDs. A valid historical selection from the Results page is preserved when opening its score modal.
- Class and subject choices remain limited to actual subject-teacher assignments. A class-teacher assignment alone does not grant subject score entry.
- The page and modal share one editor. Desktop uses an editable table; mobile keeps student cards. Both show CA1 /20, CA2 /20, Exam /60, live totals and optional remarks.
- Submitted, approved and published rows are disabled and excluded from save requests. Backend assignment and workflow checks remain authoritative.
- Blank marks remain null; an entered zero remains zero. Untouched rows are not saved. Invalid marks show the student name, and remarks are limited to 200 characters.
- Classes over 200 students save in batches within the existing API limit. A failed/partial save retains the device draft for review and retry.
- Legacy score-page rendering now uses the same editor instead of a hardcoded term placeholder.

## Offline drafts

- Each edit saves a draft under the signed-in user, school, class, term and subject. Switching selectors keeps the previous draft separate.
- Previously loaded calendars, assignments and sheets can be opened from saved copies for up to 24 hours. Server permission failures do not use cached copies.
- Offline scores are device drafts, not confirmed school records. Reconnect, review and click Save scores. They are not silently submitted in the background.
- Draft restore ignores students outside the current roster and ignores changes to locked rows. Account/school changes stop writes from the old editor.
- If device storage fails, the page shows an error. Keep it open; the draft has not been safely saved.

## Quick test

1. As an assigned subject teacher, open Results → Enter scores. Check that the active school year and term are selected by name.
2. Select another valid term, class and subject. Confirm the correct sheet opens and no term ID input exists.
3. On desktop, edit marks in the table. On mobile, edit the same student cards. Totals should update immediately.
4. Leave one mark empty and enter zero in another. Save/reload: the first stays empty; the second stays zero.
5. Enter a value above the column limit. Save should identify the student and retain the draft.
6. Confirm submitted/approved/published rows cannot be edited. An unassigned subject must remain inaccessible through the API.
7. Edit two different class/term/subject combinations, switch back and reload. Each draft should remain separate.
8. Open a saved sheet offline and edit it. Reconnect, review, then save to the school.
9. Open Enter scores from the Results modal and check that it uses the same term picker and responsive editor.

This batch changes frontend code only. No additional database migration, backend environment change or dependency is needed.
