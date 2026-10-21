# School portal: complete MVP manual test guide

Prepared: 21 October 2026. This is a test plan, not a claim that every test has passed.

## How to use this guide

- Run the numbered sections in order on staging with invented student data.
- Use a fresh school for the first run. Keep a second school for isolation tests.
- Record each test as **Pass**, **Fail**, **Blocked**, or **Not run**.
- Pass only when the expected result is visible. Reload saved records to check persistence.
- If a feature is missing or broken, record it; do not treat that as a pass.
- Browser tests use the current portal. Tests marked **API/operations** need an API client, server access, or automated tests.
- Never paste passwords, invitation/reset links, cookies, tokens, or real student details into a bug report.

### Prepare test accounts and records

| Test item | Prepare |
| --- | --- |
| Schools | School A and School B, with different workspace names |
| School A accounts | Owner, school administrator, principal, teacher, exam officer, bursar, general staff, two parents |
| School B accounts | Owner, teacher and parent |
| Classes | Two active classes; assign the teacher to only one |
| Subjects | Mathematics and English; link different subjects to each class |
| Students | Two siblings linked to Parent A; another child linked only to Parent B; one student in School B |
| Calendar | Two school years; first, second and third terms |
| Email | Mailboxes you control; working email provider and worker for delivery tests |
| Devices | Desktop browser, separate browser profile, Android or iPhone; tablet if available |

Use `2026/2027`, `JSS 1 A`, and `JSS 1 B` as example data. Use your actual staging URL wherever a path is shown.

Run cold-offline tests on a production frontend build over HTTPS (or localhost for a local desktop check). The service worker is not prepared by `next dev`. A phone opening an ordinary HTTP LAN address is not equivalent to an HTTPS staging test.

### Rules to use while testing

- New passwords: at least 8 characters, at least one letter and one number, at most 128 characters and 72 UTF-8 bytes. ASCII passwords are limited to 72 characters by the byte limit. Symbols and both letter cases are allowed but are not required by the current backend.
- Login uses the existing password; it does not impose new-password complexity rules.
- Registration workspace name: 2–60 characters; lowercase letters/numbers, with single hyphens between groups. No spaces, underscores, leading hyphens or trailing hyphens.
- Current score-entry screen: CA1 0–20, CA2 0–20, Exam 0–60. Blank is not the same as zero.
- Manual fee amounts: positive whole naira. Do not use decimals or negative values.
- Offline support is for prepared attendance work. Fees, invitations, result submission/publication and settings need a connection. A saved score draft is not a server submission.

## 1. Registration and sign-in

### AUTH-01 — Register a new school

- Open `/register` while signed out.
- Enter first name, last name, email, optional phone, password and matching confirmation.
- Continue to school details.
- Enter the school name and review the generated workspace name.
- Submit registration.
- **Expect:** one school and owner account are created; the owner enters the school dashboard/setup flow.
- Sign out; sign in using the new workspace and credentials.
- **Expect:** the same school opens; registration did not create a duplicate.

### AUTH-02 — Reject invalid registration

- Repeat registration with each of: empty required field, invalid email, mismatched passwords, seven-character password, letters-only password, numbers-only password, and password over the byte limit.
- Try a one-character school name and an invalid workspace name.
- Try an email/workspace already registered.
- **Expect:** the invalid request fails with an understandable message; no partial or duplicate school is created.
- Correct the invalid field and retry.
- **Expect:** valid input can be submitted without restarting the form.

### AUTH-03 — Login

- Open `/login`.
- Enter the school workspace name, email and existing password.
- Click **Sign in**.
- **Expect:** school staff enter their permitted dashboard; a parent enters the parent workspace.
- Reload the page.
- **Expect:** the same account and school remain active while the session is valid.

### AUTH-04 — Reject incorrect login

- Try a wrong password, unknown email, wrong workspace and blank fields separately.
- Try an account that has no active membership in the requested school.
- **Expect:** sign-in fails; no school data or dashboard access is granted.
- Enter correct credentials afterward.
- **Expect:** ordinary mistakes do not permanently prevent a valid login.

### AUTH-05 — School workspace and shared accounts

- Sign in to School A with an account that also belongs to School B.
- Confirm School A's name and records.
- Sign out; sign in explicitly to School B.
- **Expect:** School B's role, name and records replace School A's context.
- Do not assume the MVP includes an in-app school switcher or multiple roles in one school.

### AUTH-06 — Sign out

- Sign in; open a protected page.
- Click **Sign out**.
- Use browser Back; reload the protected page.
- **Expect:** fresh protected requests require sign-in. Old content must not remain usable as an authenticated session.
- Repeat while the backend is unavailable.
- **Expect:** local identity is cleared. Remote revocation cannot be assumed until the server was reached.

### AUTH-07 — Session refresh and stale tabs

- Open two tabs using the same account.
- Leave them until the access credential needs refreshing; use an approved short expiry in staging if needed.
- Load protected data in both tabs.
- **Expect:** refresh completes without repeated sign-in prompts or a refresh loop.
- Sign out or sign in as another account in one tab; use the other tab.
- **Expect:** stale requests fail or the tab updates; it must not display newly fetched data under the old identity.

### AUTH-08 — Forgot password

- Click **Forgot password?**.
- Enter a registered email and submit.
- **Expect:** a neutral acknowledgement; a reset email arrives when delivery is configured.
- Repeat with an unknown email.
- **Expect:** the response does not disclose whether that account exists.
- Repeat without a network connection.
- **Expect:** no false delivery/success claim for an unsent request.

### AUTH-09 — Reset password

- Open a valid reset link from the controlled mailbox.
- Enter a password meeting the new-password rules; submit.
- **Expect:** reset succeeds; the old password stops working and the new password signs in.
- Use the link again; try an expired or altered link.
- **Expect:** reuse, expiry and tampering are rejected.
- Try a previously active session after reset.
- **Expect:** its next protected server request is rejected.

## 2. Invitations and staff access

### STAFF-01 — Invite a teacher or exam officer

- Sign in as an owner, administrator or principal.
- Open **Teachers**; click **Invite teacher**.
- Enter the person's name, email, optional phone and offered teaching role.
- Submit.
- **Expect:** a pending invitation is acknowledged. The school does not choose the recipient's password.
- Check the controlled mailbox and invitation history.
- **Expect:** the invitation is delivered when the email setup is working; pending access is not treated as an accepted membership.

### STAFF-02 — Invite non-teaching staff

- In **Teachers**, find **Other staff**; click **Invite other staff**.
- Enter names/email and select Bursar or Staff.
- Click **Send staff invitation**.
- **Expect:** the form confirms queuing; history shows the email, role, expiry and pending status.
- Repeat as a principal/administrator.
- **Expect:** an owner role is not offered. Only an owner can grant owner access.

### STAFF-03 — Invitation validation and failure recovery

- Submit an incomplete name, invalid email or unsupported role.
- Disconnect before submitting a valid invitation.
- **Expect:** rejection/failure is clear; entered values remain; reconnecting does not silently resend the invitation.
- Reconnect and submit deliberately.
- **Expect:** the invitation is queued once for that deliberate attempt.

### STAFF-04 — Accept as a new account

- Open the invitation link in a signed-out browser.
- Select **I'm creating a new account**.
- Choose a valid password; click **Accept invitation**.
- **Expect:** acceptance is confirmed and **Go to sign in** is available.
- Sign in using the invited email and school workspace.
- **Expect:** the invited role is active; only that role's features appear.

### STAFF-05 — Accept with an existing account

- Invite an existing SchoolOS account to another school.
- Open its link; select **I already have a SchoolOS account**.
- Enter the current password and accept; also test **Accept as [email]** while signed in as the correct account.
- **Expect:** membership is added without replacing the existing account password/profile.
- Try the wrong password or a different signed-in account.
- **Expect:** acceptance is denied; another person's invitation cannot be claimed.

### STAFF-06 — Revoke, replace and expire invitations

- Revoke a pending staff invitation in **Recent staff invitations**.
- **Expect:** status changes to Revoked; its link cannot be accepted.
- Send a replacement invitation to the same email.
- **Expect:** only the replacement pending link works; the earlier pending link is invalid.
- Try an accepted, expired and altered link.
- **Expect:** none grants another membership or renewed access.
- Expiry may require waiting or a controlled test fixture; do not alter production records.

### STAFF-07 — Staff search, pagination and status

- Search teaching staff by a known name/email.
- Use active/inactive/all filters and Previous/Next where shown.
- Check non-teaching staff and invitation history separately.
- **Expect:** the correct people appear; empty results differ from loading failures; current teacher assignments are accurate.
- Use more than one page of memberships.
- **Expect:** later-page staff remain available to the staff administration flow.

### STAFF-08 — Disable and re-enable school access

- As an authorized manager, disable another test staff membership.
- **Expect:** its school access becomes inactive; backend assignment cleanup follows the role/access change.
- Try a protected request in that staff member's existing session.
- **Expect:** access is denied without waiting for the browser to hide a button.
- Re-enable the membership and sign in again.
- **Expect:** school access returns; verify assignments explicitly rather than assuming they were restored.
- Confirm self-disable controls are omitted and non-owners cannot manage owners. Test last-owner protection through the API.

## 3. School setup and settings

### SETUP-01 — New school setup

- Open the new owner's dashboard/setup checklist.
- Review missing requirements.
- Add the calendar, class, curriculum, teacher assignment, student and parent link requested by the checklist.
- Refresh the checklist; complete onboarding when allowed.
- **Expect:** completion uses server-confirmed requirements and persists after reload.
- Try completion while requirements are missing.
- **Expect:** incomplete setup is identified; the portal does not fabricate completion.

### SETUP-02 — School profile

- Open **Settings**; edit supported profile/contact fields.
- Save; reload; sign in from another browser.
- **Expect:** saved values persist and belong to the current school only.
- Submit invalid email, required blank values or oversized text.
- **Expect:** validation fails without losing unrelated valid input or showing false success.

### SETUP-03 — Branding

- Update the supported logo/colour fields in Settings.
- Save and reload the dashboard and public school page.
- **Expect:** supported branding persists; text and controls remain readable.
- Try malformed colour/URL values through the API if the input control prevents entry.
- **Expect:** invalid values are rejected according to the backend schema.
- Logo upload is not assumed; use the input type actually provided.

### SETUP-04 — Workspace name

- Change the school's workspace name through its supported settings control.
- **Expect:** the new value persists and resolves to the correct school; sign-in works with the current name.
- Try a duplicate or invalid value.
- **Expect:** it is rejected without changing another school's name.
- Record whether the old URL redirects or becomes unavailable; do not require an unimplemented alias.

### SETUP-05 — Academic and account settings

- Open **Academic** in Settings.
- **Expect:** the actual current year/term appears; its management link opens School year.
- Open **Account**.
- **Expect:** the current account email appears; recovery links reach the real reset flow.
- **Expect:** hardcoded example years and pretend email/password saves are not presented as working features.

## 4. Academic calendar

### CAL-01 — Create a school year and terms

- Open **School year** as an authorized manager.
- Add `2026/2027`; create the requested First, Second and Third terms.
- Reload.
- **Expect:** one year with the intended terms appears; term names are not duplicated within it.
- Test adding a missing term to a partially created year.
- **Expect:** the missing term can be added without recreating the year.

### CAL-02 — Set current year and term

- Create a second year.
- Set a year and one of its terms as current.
- **Expect:** one current year/term context is shown consistently in the dashboard, attendance/results selectors and settings.
- Switch to the other year/term; reload.
- **Expect:** the new context persists; historical records are not relabelled as new-term records.

### CAL-03 — Calendar errors and partial saves

- Try blank/one-character year names and invalid dates where dates are supported.
- Interrupt creation after the year saves but before all terms save.
- **Expect:** the saved year remains; the failure identifies what needs repair; retry does not create duplicate years/terms.
- Sign in as a teacher, bursar or parent and try the management URL.
- **Expect:** unauthorized calendar writes are denied.

## 5. Classes, subjects and assignments

### CLASS-01 — Create and edit classes

- Open **Classes** as an owner/admin/principal; click **Add class**.
- Create `JSS 1 A` and `JSS 1 B` using the offered name/arm/level fields.
- Edit a class; save and reload.
- **Expect:** the selected class changes; its students and assignments remain attached to the correct record.
- Try missing required data and a duplicate class/arm.
- **Expect:** errors are clear; duplicates are not silently created.

### CLASS-02 — Search and deactivate a class

- Search by class name; use level and inactive filters.
- Open Manage and deactivate an expendable test class.
- **Expect:** the class becomes inactive; existing history is not physically erased; active choices reflect its status.
- Reload and use the inactive filter.
- **Expect:** the inactive record can be distinguished from a deleted/missing record.

### CLASS-03 — Create and edit subjects

- Open **Subjects**; add Mathematics and English with supported codes.
- Edit one subject and reload.
- **Expect:** the correct subject changes; blank/invalid values are rejected.
- Deactivate a disposable subject through the supported control/API.
- **Expect:** it is not offered as an active new assignment; historical result data remains intact.

### CLASS-04 — Link and replace curriculum

- Open a class's Subjects tab or **Assign subjects to class**.
- Link Mathematics and English; save and reload.
- Remove English from the selection and save as replacement.
- **Expect:** Mathematics remains; English is removed from that class's curriculum, including its class-specific teaching assignment.
- Confirm other classes' curricula are unchanged.

### CLASS-05 — Assign a class teacher

- Open Manage → Overview.
- Choose a staff member by name; click **Save class teacher**.
- Reload.
- **Expect:** the selected person appears as class teacher.
- Try assigning that person to another class; test Clear where offered.
- **Expect:** the one-class-teacher assignment rule is enforced; clearing persists. No UUID copying is needed.

### CLASS-06 — Assign subject teachers

- Open the class Teachers tab or subject-teacher modal.
- Choose a named teacher for Mathematics and save.
- Reload; clear the assignment; reload again.
- **Expect:** saved and cleared states match the server.
- Edit two subject rows; save only one.
- **Expect:** the other unsaved selection remains until deliberately saved/closed.
- Confirm bursars and globally disabled accounts are not offered as teaching choices.

### CLASS-07 — Edit assignments from teacher details

- Open a teacher's details; add an assignment.
- Choose a class, then one of its linked subjects.
- Change the class.
- **Expect:** the subject selection resets and only the new class's curriculum is offered.
- Try assigning a subject already held by another teacher through this bulk workflow.
- **Expect:** a conflict is explained; it must not silently steal the assignment. Use the class-specific replacement control deliberately.

### CLASS-08 — Teacher My classes

- Sign in as the assigned teacher; open **My classes**.
- Click **Open class**.
- **Expect:** the class, subjects and active student roster load; the roster request follows successful class validation.
- Confirm score actions apply to subjects assigned to the teacher.
- Open an unassigned class URL.
- **Expect:** the teacher detail flow refuses access and does not show its roster.
- Repeat with a class URL from School B.
- **Expect:** no School B details appear.

## 6. Students and enrolment

### STUDENT-01 — Add a student

- Open **Students**; add a student with first/last name and the supported optional fields.
- Select an active class and current session where offered; save.
- **Expect:** one student appears with an admission number and the selected class.
- Leave admission number blank for another student.
- **Expect:** a number is generated where the creation flow supports automatic numbering.
- Reload and inspect the saved details.

### STUDENT-02 — Student validation

- Try blank names, malformed parent email and a duplicate admission number in School A.
- **Expect:** invalid records are rejected; the first student is not overwritten.
- Use the same admission number for a different student in School B.
- **Expect:** uniqueness is scoped to the school, not all schools.
- Optional phone/email fields do not by themselves create a parent login or child link.

### STUDENT-03 — Search, filter and paginate

- Search by full/partial name and admission number.
- Filter by class/status using the offered controls; move between pages.
- Clear the search and filters.
- **Expect:** matching records, page counts and empty states are consistent; students are not lost because only the first page was loaded.
- Disconnect while loading.
- **Expect:** a failure is shown rather than a misleading empty directory.

### STUDENT-04 — Edit and enrol

- Edit a student's name and class; save and reload.
- Verify enrolment in the intended session through the UI or API.
- Repeat the save.
- **Expect:** the same student is updated; enrolment is not duplicated.
- Simulate enrolment failure after the student update.
- **Expect:** the message distinguishes saved details from unconfirmed enrolment and supports deliberate retry.

### STUDENT-05 — Archive a student — API if no UI control

- Archive a disposable student using the supported endpoint/control.
- **Expect:** active rosters and new invoice generation exclude the student; prior attendance, results and financial history remain preserved.
- Check active/inactive list filters and the parent's view.
- **Expect:** no unrelated student is archived or exposed.

## 7. Parent records and child links

### PARENT-01 — Create and edit a parent profile

- Open **Parents and guardians**; click **Add parent**.
- Enter first/last name and optional contact details; click **Create parent**.
- Select the parent, change details and click **Save parent details**.
- Reload.
- **Expect:** the profile persists without automatically granting account access.
- Try missing names and invalid email; expect validation errors.

### PARENT-02 — Link children

- Open the parent; use **Find a child** with a name/admission number.
- Choose the correct student; click **Link selected child**.
- Repeat for a sibling; reload.
- **Expect:** both intended children appear once. Similar names can be distinguished by admission number.
- Try linking a student from School B through the API.
- **Expect:** denial; no cross-school link is created.

### PARENT-03 — Invite a linked parent

- Save an email and link at least one child.
- Click **Send invitation**; accept it from that mailbox.
- **Expect:** the parent chooses/proves their own password; accepted access connects to the intended profile.
- Before acceptance, confirm the profile is not treated as a fully connected account.
- Test missing email/no children.
- **Expect:** the invitation action explains or prevents incomplete setup.

### PARENT-04 — Search, conflicts and link maintenance

- Search parents by name, phone and email; use pagination.
- Try connecting an existing account already linked to another parent profile in the same school.
- **Expect:** a conflict is rejected without overwriting the existing profile.
- **API:** unlink a child or deactivate a parent profile using a disposable record.
- **Expect:** subsequent parent requests lose access to that removed/inactive relationship.

## 8. Attendance: online

### ATT-01 — Load the correct roster

- Sign in as the assigned teacher; open Attendance.
- Select class and date.
- **Expect:** active students and any existing marks for that date load.
- Change class/date.
- **Expect:** marks from the previous selection do not leak into the new selection.
- Compare the selected date on devices in the intended timezone.

### ATT-02 — Mark and save attendance

- Mark different students Present, Absent, Late and Excused where offered.
- Use mark-all controls if available, then change individual exceptions.
- Save using the displayed action; complete any confirmation.
- Reload the same class/date.
- **Expect:** exactly the intended statuses persist. Unlisted records must not be silently marked present by an offline batch.

### ATT-03 — Correct and protect attendance

- Change an existing mark and save deliberately.
- **Expect:** the correct existing record updates without duplicate rows.
- Try an unassigned class as the teacher and a write as read-only general staff.
- **Expect:** unauthorized server writes are denied.
- Submit malformed dates/statuses/foreign student IDs through the API.
- **Expect:** invalid or cross-school records are rejected.

## 9. Attendance: offline and recovery

### OFF-01 — Prepare the device

- While online, sign in on the phone/browser to be used offline.
- Open attendance; load the required class and date completely.
- Allow the offline shell preparation to finish; inspect any readiness/error message.
- **Expect:** the device can save the shell/roster. Failed preparation must not claim readiness.
- Do not clear browser/site storage during the following recovery tests.

### OFF-02 — Save without a connection

- Disable Wi-Fi and mobile data.
- Reopen the prepared attendance work; change marks and save on the device.
- **Expect:** offline status/copy time and pending work are clear; no server-sync success is claimed.
- Reload while offline.
- **Expect:** saved pending marks remain on the same device/account/school.

### OFF-03 — Cold offline startup

- Close the portal tab/browser after preparing and saving work.
- Keep the device offline; reopen the prepared attendance URL or `/offline-attendance`.
- **Expect:** the prepared attendance shell opens and saved work is recoverable.
- Repeat in a fresh browser that was never prepared.
- **Expect:** a clear connect/prepare-first fallback; no invented roster or false successful save.

### OFF-04 — Reconnect and sync deliberately

- Restore the connection.
- **Expect:** pending attendance does not upload silently just because the network returned.
- Click **Sync now** and complete the confirmation, if shown.
- **Expect:** only acknowledged batches leave the queue.
- Reload online or check from another authorized device.
- **Expect:** the intended marks reached the server once.

### OFF-05 — Interrupted sync and retry

- Queue attendance; interrupt the connection during sync.
- Reload; reconnect; retry the same pending work.
- **Expect:** pending/unacknowledged work remains recoverable; stable retry identifiers prevent duplicate rows.
- Test multiple batches for one date and a roster over 200 students with controlled fixtures.
- **Expect:** latest intended marks are understandable; uploads are chunked and confirmed per batch.

### OFF-06 — Account changes and expired permissions

- Save pending work as Teacher A; sign out and sign in as another account/school.
- **Expect:** Teacher A's queue is not shown or uploaded as the new user.
- Return to Teacher A's original school.
- **Expect:** its pending work remains available if site storage was retained.
- Revoke the teacher's access before syncing.
- **Expect:** the server denies sync; pending work is not falsely acknowledged as uploaded.

### OFF-07 — Full storage and unsupported browsers

- In a disposable browser profile, simulate storage denial/quota exhaustion.
- Try offline preparation and saving marks.
- **Expect:** an actionable error; no statement that unsaved work is safe on the device.
- Try private browsing or a browser without service-worker support.
- **Expect:** limitations are reported; ordinary online attendance still has a usable failure/retry path.

## 10. Results and publication

### RESULT-01 — Open score entry

- Sign in as the assigned teacher; open Results/Enter scores.
- Select the year/term, assigned class and subject.
- **Expect:** the correct students load. Simply reading a sheet does not create empty result records.
- Change class.
- **Expect:** the previous subject selection resets; unauthorized subjects are not offered.

### RESULT-02 — Save valid scores

- Enter CA1 `15`, CA2 `15`, Exam `55`; save.
- Reload the same sheet.
- **Expect:** the values persist; total is `85`. Verify the grade against the configured scale, not an assumed universal grade.
- Save zeros for another student; leave a different student's entries blank.
- **Expect:** zero is retained as a score; blank values are not silently converted to zero.

### RESULT-03 — Score limits and draft recovery

- Try CA1/CA2 above `20`, Exam above `60`, negatives and nonnumeric text.
- **Expect:** the entry screen prevents/rejects invalid scores with a clear message.
- Edit valid marks; disconnect before saving; reload the same account/class/term/subject.
- **Expect:** a device draft can be restored where saved; it is not labelled submitted to the server.
- Return online and save deliberately; switch school/account and check again.
- **Expect:** drafts do not appear in another workspace.

### RESULT-04 — Submit for review

- Open the saved student's result in the result view.
- Click **Submit for review** when offered.
- **Expect:** status becomes Submitted; the student's score sheet is locked against ordinary teacher edits.
- Sign in as the parent before approval/publication.
- **Expect:** the submitted result is not visible as a published report.

### RESULT-05 — Approve or return

- Sign in as owner/admin/principal/exam officer with publication permission.
- Review a submitted result; click **Return to draft**.
- **Expect:** the teacher can correct and resubmit it.
- Resubmit; click **Approve**.
- **Expect:** status becomes Approved; a teacher cannot approve by copying the request/URL.

### RESULT-06 — Publish and parent visibility

- Publish an approved result using **Publish to parents** or the class publication workflow.
- Sign in as the linked parent; open the child's Results and refresh.
- **Expect:** the approved published result appears with the correct term, subject marks, totals and grade.
- Try publishing an unapproved result through the API.
- **Expect:** lifecycle rules are enforced; a warning about incomplete classes is not permission to bypass approval.

### RESULT-07 — Unpublish and partial failures

- **API if the current UI has no working control:** unpublish a published class/term.
- Refresh the parent's results.
- **Expect:** the unpublished report is no longer returned as visible.
- Interrupt a multi-class publication operation.
- **Expect:** partial completion is not reported as complete; reload shows actual per-record status and supports a deliberate retry.

### RESULT-08 — Report preview

- Open an available result preview/report view.
- Compare school, child, admission number, class, year/term and every score with the saved record.
- **Expect:** the correct child's report appears; missing values stay distinguishable from zero.
- Test long names and phone-width tables; test printing/export only where a working control exists.
- **Expect:** no mixed-child data, cut-off essential values or false successful download.

## 11. Fees, invoices and manual payments

### FEE-01 — Create fee categories

- Sign in as a bursar or authorized school manager.
- Open fee setup/items; create Tuition and Transport using the offered controls.
- Reload.
- **Expect:** categories persist in the current school; blank/oversized names are rejected.
- Sign in as principal; try a fee write.
- **Expect:** read access does not grant fee/payment editing permission.

### FEE-02 — Create a fee structure

- Create a structure for the intended class/year/term.
- Add Tuition `40000` and Transport `10000`; save.
- **Expect:** the total is ₦50,000 and the correct class/term is attached.
- Try no items, zero, negative and decimal amounts.
- **Expect:** invalid structures are rejected without creating a usable partial structure.

### FEE-03 — Generate invoices

- Open the class charge/invoice generation flow.
- Choose the structure and intended active students; generate invoices.
- Reload the invoice list and inspect each intended student.
- **Expect:** one correct bill per selected student for the operation, with ₦50,000 total and ₦50,000 balance before payments.
- Confirm other classes, inactive students and School B were not charged unintentionally.

### FEE-04 — Interrupted invoice generation

- Interrupt the response after generation starts.
- Reload and use the pending-operation recovery/retry for the same attempt.
- **Expect:** the same logical request is retried, not a second charge.
- Change the pending payload or start over without resolving it.
- **Expect:** the portal prevents ambiguity or explains recovery; it must not silently discard a possibly completed attempt.

### FEE-05 — Invoice search and details

- Find a student by name/admission number; inspect invoice items and balances.
- Use the offered term/status/outstanding filters.
- **Expect:** correct totals in naira; paid, partly paid and outstanding states match the invoice.
- Reload from another authorized browser to confirm persistence.

### FEE-06 — Record a partial manual payment

- Open the payment recording flow; choose the intended invoice/student.
- Enter `20000`; choose Cash, Bank transfer, POS or Other as appropriate; add a test note if supported.
- Submit once.
- **Expect:** payment and receipt are recorded; paid is ₦20,000 and balance is ₦30,000.
- Pay the remaining `30000`.
- **Expect:** paid is ₦50,000; balance is zero; payment and receipt history reconcile.

### FEE-07 — Reject invalid payment/allocation

- Try zero, negative, decimal and nonnumeric amounts.
- Try allocating more than the invoice balance or more than the available payment.
- Try an invoice from School B.
- **Expect:** invalid allocations fail; balances and receipts remain consistent. Do not assume an unallocated overpayment is prohibited: test the backend's explicit allocation rules.

### FEE-08 — Ambiguous payment response

- Interrupt the connection after submitting a payment but before confirmation.
- Reload; recover/retry the same pending payment.
- **Expect:** the payment keeps the same logical identifier; only one payment and the correct receipt set exist.
- Try rapid double-clicks and a concurrent retry from two tabs.
- **Expect:** duplicate allocations/receipts are prevented; a pending attempt is not silently replaced with different details.

### FEE-09 — Receipts and parent balances

- Open the recorded receipt through its supported UI or receipt API.
- Compare amount, invoice, student, date and receipt number.
- Sign in as the parent; open **Fees and receipts** and click **Refresh**.
- **Expect:** the correct child's invoice, paid amount, balance and receipts appear; siblings' bills stay under the right child.
- Parent/teacher attempts to record a payment must fail.

### FEE-10 — Invoice correction/cancellation — API/operations

- Use `PATCH /fees/invoices/:id` on a disposable eligible invoice with a correction reason and valid changed items/due date.
- Use `POST /fees/invoices/:id/cancel` with a reason on a cancellable test invoice.
- **Expect:** eligibility and payment-history rules are enforced; audit/history remains; cancellation is not physical deletion.
- Repeat without a reason, without write permission and with a foreign-school ID.
- **Expect:** rejection without corrupting balances or receipts.

### FEE-11 — Payment reversal/allocation — API/operations

- Use `POST /fees/payments/:id/allocate` for a valid unallocated test payment.
- Reverse an eligible test payment with `POST /fees/payments/:id/reverse` and a reason.
- **Expect:** allocations, invoice balances and receipt void status remain consistent; history is retained.
- Repeat the reversal and attempt concurrent/foreign-school allocations.
- **Expect:** no double reversal or overspending of the same payment.

## 12. Parent workspace

### FAMILY-01 — Correct home and children

- Sign in as Parent A.
- **Expect:** Parent workspace opens; only active linked children from the selected school appear.
- Sign in as Parent B; repeat.
- **Expect:** Parent A's children/data never appear under Parent B.
- Test a linked child with no results or invoices.
- **Expect:** the child still appears with honest empty states.

### FAMILY-02 — Results, fees and school updates

- Expand each child's **Results** and **Fees and receipts**.
- Refresh after staff publish results or record a payment.
- Expand a published school announcement.
- **Expect:** current published results, correct balances/receipts and permitted school updates appear; loading failures are not called empty records.
- Confirm the parent cannot edit these records or open school-admin routes.

### FAMILY-03 — No linked children/inactive profile

- Test an active parent profile with no active children.
- **Expect:** a clear no-linked-children state with contact-school guidance.
- Test a parent account with no matching active profile in that school.
- **Expect:** contact-school/access error; no fallback to another school's family records.
- **API:** test parent attendance history for a linked and an unlinked child.
- **Expect:** only linked-child history is returned. A parent attendance screen is not assumed in the current UI.

## 13. Announcements

### MSG-01 — Save a draft

- Sign in as owner/admin/principal; open Messages → new announcement.
- Enter a title and body; choose draft/save-draft.
- **Expect:** the draft appears to authorized writers, including the principal; it is absent from parent/teacher published lists.
- Reload and reopen it.
- **Expect:** saved text and status persist.

### MSG-02 — Publish immediately

- Create an announcement; choose **Publish now**.
- **Expect:** it is published immediately, not silently saved as a draft.
- Sign in as a teacher and parent; refresh school updates.
- **Expect:** the published active notice is readable; writer-only controls remain hidden.

### MSG-03 — Schedule and expire

- Schedule a notice a few minutes ahead using local date/time.
- Set expiry later than publication; save.
- **Expect:** readers cannot see it early; the running scheduler publishes it when due.
- Wait past expiry; refresh readers.
- **Expect:** the expired notice is unavailable to ordinary readers.
- Try past/invalid schedule times and expiry before publication.
- **Expect:** invalid values are rejected before a misleading success.

### MSG-04 — Pin, edit and hide

- Pin a published notice; reload and inspect ordering/marker.
- Edit its supported fields; save and reload.
- Deactivate it through the supported control/API.
- **Expect:** updates persist; ordinary readers cannot open hidden content through a copied detail URL.
- Confirm notices from School B are absent.

### MSG-05 — Validation, errors and list limits

- Try blank title/body, title over 200 characters and body over 5,000 characters.
- Disconnect before publishing.
- **Expect:** clear validation/network errors; entered text remains; no automatic publication on reconnect.
- Search/filter the list; create more than the displayed recent-item limit with fixtures if needed.
- **Expect:** the limit/search scope is honest; a limited recent list is not presented as all historical announcements.

## 14. Role permissions and tenant isolation

### ACCESS-01 — Check every role

Repeat login, navigation and a forbidden direct-URL/API attempt for each role below. A hidden button alone is not authorization.

- **Expect:** permitted actions work; restricted actions are rejected by the server even when called directly.

| Role | Main allowed scope to verify | Important restriction |
| --- | --- | --- |
| Owner / school administrator | Setup, people, assignments, attendance, results, fees, announcements | Owner-grant/last-owner restrictions still apply |
| Principal | School management, result publication, announcements; finance reads | No fee/payment writes; no owner grants |
| Teacher | Assigned teaching/attendance/result actions and announcements | No approval/publication, finance, staff or settings writes |
| Exam officer | Result entry/publication, class/student reads, announcements | No attendance writes, finance or staff administration |
| Bursar | Finance and permitted student/parent reads, announcements | No result entry, class management, attendance or staff administration |
| General staff | Student/attendance reads and announcements | No attendance write, results, finance or management writes |
| Parent | Linked-child records and published school updates | No administrative directories or another family's records |

### ACCESS-02 — Copy another school's identifiers

- Capture disposable School B record IDs while authorized there.
- As School A, request B's student, parent, class, result, invoice, receipt and announcement details.
- Repeat with edit/link/payment/assignment requests through the API.
- **Expect:** denial/not-found/unavailable; no returned data, links or changes in School B.
- Compare an unknown ID with a foreign ID; neither should disclose private record details.

### ACCESS-03 — Account change during requests

- Start a slow paginated class/student/membership load as School A.
- Sign out/sign in to another account or school before it finishes.
- **Expect:** old work is cancelled/discarded; pages from different identities are not combined.
- Repeat with a result save, invoice/payment attempt and attendance sync.
- **Expect:** late responses are not applied to the new workspace; uncertain writes remain recoverable in their original scope.

### ACCESS-04 — Forged permissions and inactive access — API/operations

- Modify client-side role/permission data in a disposable browser profile or call the API directly.
- **Expect:** the server still uses current membership and permissions.
- Deactivate a membership/global account; try its existing session.
- **Expect:** the next protected server request fails; parent/teacher relationships are rechecked where required.

## 15. Mobile, accessibility and ordinary failures

### UX-01 — Phone and tablet layouts

- Repeat login, registration, invitations, class assignments, student/parent editing, attendance, score entry, fees and announcements at phone width and in portrait/landscape.
- Open/close menus, bottom navigation and modals; open the software keyboard.
- **Expect:** fields, errors and save/close actions remain reachable; tables scroll inside their container; essential content is not hidden under fixed navigation.
- Check long names, long emails, large amounts, empty lists and many rows.
- **Expect:** the original design remains usable without a broken page-wide layout.

### UX-02 — Keyboard and readable feedback

- Use Tab, Shift+Tab and Enter to complete the main forms.
- Check visible focus, input labels, selected status and disabled/loading controls.
- Increase browser zoom to 200%; check validation/error text.
- **Expect:** controls remain understandable and operable; status is not communicated by colour alone.
- Use a screen reader for login, a form error and an attendance status if available; record unavailable device checks as Blocked.

### UX-03 — Slow network and server errors

- Throttle the network; force a controlled API failure on each main list and form.
- **Expect:** loading, empty, failure and saved states remain distinct; retry is available where appropriate.
- Double-click Save/Submit; navigate away during an attempt.
- **Expect:** no false success or duplicate logical payment/invoice/sync; unresolved work is not silently discarded.

### UX-04 — Unsupported offline actions

- Disconnect and attempt login, invitations, settings changes, result publication and manual payments.
- **Expect:** clear connection errors; no false success and no automatic replay of consequential writes on reconnect.
- Reconnect and verify the records from another device before retrying an ambiguous write.

## 16. Public pages and deferred features

### PUBLIC-01 — School public view

- Open `/s/<workspace>` while signed out.
- **Expect:** only public school information and supported branding appear; no student, payment, staff-account or session secrets.
- Test a school with no custom site content and an unknown workspace.
- **Expect:** the supported fallback renders or an honest not-found state appears; no crash or other school's data.
- Test published report access only through its actually supported authorized flow; a public URL must not bypass child/tenant access.

### SCOPE-01 — Keep deferred features out of the acceptance promise

- Check settings and navigation for spreadsheet upload, online payments/refunds, PIN result access, custom public-site editing, extra messaging channels, automated billing and delegated platform administration.
- **Expect:** they are hidden/blocked or clearly unavailable; no placeholder reports success.
- **Expect:** calling a retired/disabled backend route cannot revive it.
- Report a visible dead control as a UI defect. Do not mark an entire deferred feature as required for this MVP.

## 17. API and deployment acceptance

These checks complement browser testing. API paths below are relative to `/api/v1`. Use test accounts and the current request schemas. Do not put actual credentials in this document.

### OPS-01 — Health and readiness

- Request `GET /health` and `GET /health/ready`.
- **Expect:** liveness succeeds; readiness succeeds only while the database is reachable.
- Simulate database unavailability on isolated staging.
- **Expect:** readiness returns 503 without private connection details; liveness remains usable. Restore the database and check recovery.

### OPS-02 — HTTPS, cookies and origins

- Serve the frontend over HTTPS with the correct backend URL and application origin.
- Sign in; inspect browser network/storage using developer tools.
- **Expect:** real access/refresh credentials are in host-only HttpOnly cookies with production Secure protection, not browser local storage or login JSON. A non-secret context marker may exist locally.
- Send a mutation from an untrusted origin or with stale session context.
- **Expect:** it fails before being treated as an authorized current-workspace write.
- Verify backend CORS reflects only allowed origins; wildcard credentialed responses fail this check.

### OPS-03 — Validation and safe errors

- Send malformed JSON, invalid IDs/enums, missing required fields and oversized bodies to representative endpoints.
- **Expect:** controlled 4xx errors; no stack trace, SQL, credentials or submitted secret data in the response.
- Send a protected request without a session and with a tampered credential.
- **Expect:** 401/403 as appropriate; no protected data.
- Record the safe request ID for a deliberately triggered server failure.

### OPS-04 — Rate limits

- In isolated staging, repeat login/reset/API attempts until the configured limit is reached.
- **Expect:** rate limiting responds predictably; forwarded proxy headers cannot trivially bypass it.
- Confirm legitimate traffic recovers after the limit window and that one client's test does not lock out all users because proxy trust is wrong.

### OPS-05 — Email and worker recovery

- Configure either Resend or SMTP and an approved sender; start the combined email worker.
- Trigger invitation, reset and a supported school notification event.
- **Expect:** messages reach the intended controlled mailbox with the correct school/link; queued is not confused with delivered.
- Stop/restart the worker; temporarily reject provider delivery.
- **Expect:** queued work survives; retries are bounded/backed off; logs do not expose tokens/passwords.
- Run concurrent workers and a scheduled announcement.
- **Expect:** leases/event uniqueness prevent duplicate processing of the same logical delivery.
- Verify expired/superseded invitation/reset links cannot regain validity because of a delayed email.

### OPS-06 — Schema and backup recovery

- Run migrations against an empty disposable database; compare schema drift.
- Back up a staging dataset; restore it into a separate empty target.
- Compare table counts/content and a sample school login, result, invoice and receipt.
- **Expect:** restored records reconcile; the original database is untouched.
- Do not use a production restore as the first rehearsal.

### OPS-07 — Supabase and server boundaries

- Check that public/anonymous Supabase access cannot read or write school tables outside the intended backend boundary.
- Confirm service-role/database secrets are absent from frontend bundles and public configuration.
- Check HTTPS, exact origins, trusted proxy settings, readiness probes and worker restart configuration on Render.
- **Expect:** browser users cannot bypass backend tenant/role checks through a database API.

### OPS-08 — Run the automated suites

- In the backend, run `npm test`, `npm run test:integration`, `npm run test:restore`, `npm run security:check`, and `npm run build`.
- Run `npm run release:check` with the intended production configuration; it validates configuration, not live delivery/connectivity.
- In the frontend, run `npm run test:mvp`, `npx tsc --noEmit --incremental false`, and `npm run build`.
- **Expect:** all required checks pass. Keep test logs and fix failures; do not count an unrun test as a pass.
- Backend database runners create private local clusters and need PostgreSQL binaries. They must not be redirected to the live database.

## 18. Final end-to-end rehearsal

### JOURNEY-01 — Run the school without skipping handoffs

- Register School A and finish its setup.
- Invite and accept teacher, bursar and parent accounts.
- Create/enrol a child; link the parent; assign the teacher's class and subject.
- Record attendance offline on a prepared device; reconnect and sync deliberately.
- Enter scores as teacher; submit; approve/publish as authorized reviewer.
- Generate an invoice as bursar; record a partial payment, retry an interrupted attempt, then clear the balance.
- Sign in as parent; verify the correct child, published scores, invoice, balance and receipts.
- Publish and schedule school notices; verify reader visibility and email separately.
- Repeat the sensitive reads with School B and the unlinked parent; verify denial.
- Sign out; confirm stale tabs and old sessions cannot continue protected access.
- **Expect:** the full journey works across accounts and reloads, without manual database repairs or changing roles to bypass an error.

## Test record

Copy one row per test ID. For larger sections, record separate rows for each invalid-input variation.

| Test ID | Account/school | Device/browser | Status | Actual result / safe request ID | Evidence / bug reference |
| --- | --- | --- | --- | --- | --- |
| AUTH-03 | Teacher / A | Android Chrome | Not run | | |

A release pass requires the main journey, role/tenant boundaries, money totals/retries, published-only parent results and prepared-device attendance recovery to pass. Record all other failures and explicitly decide whether they block release. Hosted and physical-device tests remain pending until actually performed.
