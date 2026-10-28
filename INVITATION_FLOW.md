# Email invitations and Google sign-in

## Owner flow

1. Open Staff / Teachers and choose Invite.
2. Enter only the email address and send. A top-right toast confirms the invitation is queued for delivery.
3. New invitations start as Teacher. Change a pending or accepted member's role from the staff list when needed.
4. To invite several people, choose the Excel upload link. The first worksheet needs just one header, `email`, and one address per row. Excel `.xlsx` and CSV work, up to 100 emails per upload. Names, phone and role columns are not required.
5. Check the preview and confirm. Invalid/duplicate rows must be fixed first. A saved upload retry key prevents duplicate invitations.

## Recipient flow

1. Open the emailed invitation. The page shows the invited email when the details endpoint is reachable. A failed lookup offers a retry without disabling password entry.
2. Choose Continue with Google using the invited email, or choose a password.
3. Google supplies names. Password users enter their first and last names on the next step. Existing password accounts use their current password.
4. Joining signs in as the invited account and opens its dashboard. An owner's existing browser session does not determine the recipient.
5. Invitation tokens remain in the URL fragment while filling the form, so refresh works. They are removed after successful acceptance. Tokens expire after 48 hours and cannot be reused.

## Deployment

Deploy backend and frontend together, then restart local development processes if testing locally. There is no database migration or new package dependency for this change.

The existing Brevo configuration and a valid 32-byte Base64 AUTH_EMAIL_KEY are still needed to send invitation emails. WEB_URL must be the frontend origin used by recipients. The backend handles queued delivery automatically.

Google requires an OAuth **Web application** client from Google Cloud. Add its client ID to the backend environment:

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Under that Google client's Authorized JavaScript origins, add the exact origins used to access the frontend, for example:

- https://portals-frontend-woad.vercel.app
- http://localhost:3231 (only if using this exact local origin)
- http://127.0.0.1:3231 (only if using this exact local origin)

Use the actual local frontend port if different. Add custom frontend domains separately. Publish/enable the consent screen as required by your Google Cloud project. If the project is in testing, add permitted Google test users. No client secret or redirect URI is needed for this Google Identity Services ID-token button. No NEXT_PUBLIC client ID is needed; the backend provides the public client ID.

If the client ID is absent or Google's script is blocked, the page explains that Google is unavailable and the password flow remains usable. Actual Google popup acceptance must be checked with your configured Google client; automated tests use local signed credentials and no external accounts.

Google login is available on the normal login page for accounts linked by accepting an invitation with Google. It does not silently link an existing password account by email. To link such an account, accept a valid invitation for the same email with Google. Existing passwords are preserved.

## Verification before rollout

- Invite a new email while the owner is signed in; check toast and received email.
- Open that email in the same browser; confirm the invitation email, not the owner, is shown.
- Refresh, choose a password, enter names and join. Confirm the new teacher dashboard and email.
- Repeat with a different email using Google. A wrong Google email must be rejected without consuming the invitation.
- Sign out and use Google on the login page. Confirm school selection for multi-school accounts.
- Upload an email-only Excel file, check the preview and confirm. Retry must not duplicate invitations.
- Check expired/revoked links, failed network lookup and existing-password acceptance.

Security references: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token and https://developers.google.com/identity/gsi/web/reference/js-reference .
