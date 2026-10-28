# Unread announcements and sticky navigation — batch 3

## Behaviour

- The top navbar stays visible while scrolling on desktop and mobile. The parent portal header is sticky too.
- The bell shows the number of live, unread school announcements. It refreshes once a minute while the app is visible and when focus/connection returns.
- The count covers all live notices; the dropdown previews up to 20. The board continues showing up to 50 recent notices.
- Opening a staff notice or expanding a parent notice marks it read. Just loading the board does not. Parents can open an older notice directly from the bell.
- Read status belongs to the signed-in account for that notice's school. Requests cannot supply another user or school. Draft, expired, inactive and foreign-school notices cannot be marked read.
- Repeated read requests preserve the original timestamp. Editing an already-read notice does not reset its read status. Existing notices initially appear unread because no previous read history exists.
- Read-only users still have no create/edit/filter management controls.

## Offline

- Successfully loaded announcements are cached per user, school and reader/editor access for up to 24 hours. Offline copies are labeled.
- Opening a saved published notice while offline saves a small pending read marker on this device. It retries on reconnect, focus and every minute while the app is visible.
- Failed syncs retain queued markers; a notice confirmed as unavailable (404) can be discarded from the read queue. Storage failures show an error instead of claiming the read was saved.
- Offline bell counts are labeled as saved counts and may include reads awaiting sync. Server permission errors never fall back to cached content.

## Apply before using

Run in the backend with DATABASE_URL configured for the intended database:

```powershell
npx prisma migrate deploy
npm run build
npm run dev
```

For staging, apply migrations before releasing the new backend/frontend. No new dependency or email configuration is needed. This work does not run migrations against the shared database.

## Quick manual checks

1. Publish a notice as owner. Sign in as a teacher or parent and confirm the bell and unread label.
2. Scroll a long page on mobile and desktop. The top navigation should remain visible and its menu should fit the viewport.
3. Load the announcement board without opening a notice. Its unread status should remain.
4. Open the notice. The badge should decrease; reload/sign in on another device and confirm it stays read.
5. Sign in as a different school member: their copy should remain unread.
6. Open a notice online, then a different saved notice offline. Confirm the saved-read message; reconnect and confirm the badge refreshes.
7. Check drafts, expired notices and a different school's IDs: readers should not get their contents or mark them read.
