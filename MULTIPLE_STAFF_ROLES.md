# Multiple staff roles — batch 5

## Use

1. Open Staff and find the staff member in a role tab.
2. Click their role button, select every role they need, then Save roles.
3. A Teacher plus Exam officer keeps teaching access and gains exam management. They appear in both staff tabs.
4. Assign a class teacher under Classes; assign teaching subjects under Teaching details or the class staffing screen. Class teacher is a specific class assignment, not a checkbox granting attendance access to every class.
5. The staff member can reload or return focus to the app to refresh their navigation and role labels. Backend requests always use current database roles, including existing sessions.

## Rules

- Permissions combine across all assigned roles. No arbitrary permission strings are accepted from the browser.
- Only owners, principals and school admins manage staff roles. A principal can assign academic roles but cannot grant or manage a membership containing financial, school-admin or owner duties.
- Only an owner can grant/manage owner access. The last active owner cannot be removed or demoted.
- Adding Exam officer preserves an existing Teacher's teaching assignments. Removing all teaching roles explicitly clears class/subject assignments; disabling access clears them too.
- Attendance writes still require the specific class-teacher assignment. Score writes still require the specific subject-teacher assignment, even for an exam officer, principal or owner.
- Exam officer expands school-wide result oversight, while its added Teacher duty keeps attendance reads limited to assigned classes. Owners, school admins and principals retain their attendance overview.
- Academic oversight roles can review school-wide academic progress. A Bursar plus Teacher retains assigned-class limits on results and attendance reads; finance access does not widen academic visibility.
- Principal plus Teacher does not gain finance access. A separate Bursar role must be explicitly granted by an owner/admin for financial duties.
- Parent access remains a separate portal and cannot be combined with staff roles on the same membership in this MVP. The same account can still belong to different schools.
- Invitations remain email-only and default to Teacher. A pending invitation has one starting role; assign additional roles after acceptance.
- Role edits require a connection and are not queued offline. Cached queries are cleared when the signed-in account's roles/permissions change.

## Compatibility and migration

Membership.role is retained as a primary role for existing clients and portal selection. Membership.roles holds the role set; existing memberships are backfilled with their current role. Login, refresh and /auth/me return orgRoles and combined permissions. Old access-token role claims cannot override current database permissions.

The preferred update is PATCH /memberships/:id with {"roles":["TEACHER","EXAM_OFFICER"]}. Legacy {"role":"TEACHER"} replaces the role set with that one role; sending both fields is rejected.

Apply before starting the updated backend, with DATABASE_URL pointing at the intended database:

```powershell
npx prisma migrate deploy
npm run build
npm run dev
```

Deploy both projects together. No new dependency is needed. The shared database and deployed services were not changed by this work.

## Manual checks

- Add Exam officer to an assigned Teacher. Confirm attendance for their class, score entry for their subjects and exam management all remain available.
- Try marking a different class or entering another teacher's subject. The API must reject the write.
- Remove Exam officer. Exam editing should be denied immediately with the same signed-in session; teaching assignments should remain.
- Confirm a principal cannot add Bursar, School admin or Owner, nor modify a person who already has those roles.
- Confirm a teacher cannot change their own roles through the API.
- Confirm a Bursar plus Teacher can handle payments but cannot inspect unassigned-class results.
- Confirm removing all teaching roles clears assignments and that the last active owner remains protected.
