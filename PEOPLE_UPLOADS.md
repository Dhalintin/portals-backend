# Student and staff spreadsheet uploads

- Students: Students -> Upload students.
- Staff: Staff -> Upload staff spreadsheet.
- Download the Excel-compatible CSV template. Excel can save the filled file as .xlsx or .csv. Only the first worksheet is read.
- Staff required columns: firstName, lastName, email. Default role is Teacher; General staff is also available. Spreadsheet role columns do not grant access.
- Student required columns: firstName, lastName, admissionNumber. Supply className/classArm in the sheet or choose a fallback class in the upload page. The current school year is required for enrollment. Admission/phone columns should be Text in Excel.
- Maximum 100 staff or 200 students per file; 2 MB file limit. Use values rather than formulas.
- Check spreadsheet previews all row errors before any records are created. A commit containing invalid/duplicate rows is rejected as a whole.
- Staff imports queue 48-hour invitations using existing encrypted email delivery. Staff choose passwords themselves. They appear under Recent invitations until acceptance, then in their role's staff tab.
- Pending and accepted staff have role selectors where the current user has membership-management permission. Confirmation explains potential assignment removal. Existing last-owner and role-permission rules apply.
- Interrupted imports retain a school/account-specific retry key in the browser. Retry the original attempt; don't upload a replacement while the result is uncertain. There is no automatic offline replay.
- Student imports enroll the students and create applicable automatic fee bills in the same transaction. Replaying the import does not duplicate students, bills or invitations.

## Deployment

No package installation or database migration is required for this feature. Build/restart the backend and deploy the frontend together. Existing SMTP/Resend delivery and the email worker handle staff invitation email.

## Test accounts

Eight additional active school-role accounts were provisioned into Gracefield International Academy Abuja on the configured shared database at the user's request. Existing users/passwords were not changed. Passwords are provided in the conversation, not saved in source files. Addresses use the reserved portal.test domain, so these accounts cannot receive verification/reset emails.

The parent test account is linked to the existing student. The teacher test account still needs class/subject assignments because there were no unassigned curriculum slots available. No existing staff assignment was replaced. The additional owner account is not the original school creator, so creator-only bank-change safeguards still apply.

scripts/provision-role-test-users.cjs can create additional role test accounts for an explicitly selected school. It refuses to overwrite existing test emails or passwords. It does not send email, generate a public test-login bypass or grant platform/global administrator access.
