# Staff and account settings — batch 2

## Staff

- Owner, principal and school admins see the directory, with one staff type visible at a time and 25 members per page.
- Upload staff spreadsheet is at the top right. Invite staff uses email only; new staff start as Teachers. Invitations are in the last tab.
- Role changes retain existing confirmation and principal restrictions. Access changes now require confirmation.
- Teaching details retains class/subject assignments. Class-teacher selection remains on the Classes page.
- Teachers, exam officers, bursars and other staff see their own role and assignments. They cannot retrieve the directory through its APIs.

## My account

- Open the navbar account menu, then My account settings. School, parent and platform accounts have a page within their own portal.
- Change your own first/last name or picture. Email and school role cannot be changed through this endpoint.
- Pictures are cropped to 320px JPEG in the browser; the server validates image type, dimensions and a 100 KB limit. No storage service is needed.
- Names and pictures belong to the user account and apply across its schools.
- Password changes require the current password, the existing password rules and confirmation. All sessions and outstanding reset links are invalidated on success; sign in again.
- Google-only users set their first password through the existing password-reset email flow.
- Account changes require an internet connection. They are not queued offline.

## Release and quick check

Deploy backend and frontend together. No database migration or new dependency is required. Restart a running local backend after building.

1. As owner, open Staff: check tabs, search, invitation tab, upload link and teaching assignments.
2. As teacher or bursar, open the same URL: only your details should appear. Directory API requests should return 403.
3. Open the navbar on mobile and desktop: check name, role, picture, account link and sign out.
4. Save your name and upload/remove a picture; reload and confirm the changes persist.
5. Submit an incorrect current password: the session should remain usable. Submit a valid change: all devices should require sign-in with the new password.
