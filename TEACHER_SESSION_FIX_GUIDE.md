# Batch 8: teacher sessions, invitations and browser origins

Teacher routes now use the database-backed session context (`req.auth`), school scope and current permissions. Proprietors, principals and school administrators can manage teachers. Teachers and exam officers can read their own assignments; parents cannot access staff routes. Query validation preserves numeric pagination and defaults on Express 5.

`POST /api/v1/teachers/invite` now creates a pending invitation and encrypted email job through the existing invitation service. The response is `data.invitation`, including its ID, role, status and expiry. Remove `temporaryPassword` from frontend requests. Use the acceptance endpoints documented in INVITATION_DELIVERY_FIX_GUIDE.md; membership is created after acceptance. Existing membership changes belong in the membership update flow.

`PATCH /api/v1/teachers/:id` accepts only `role` and `isActive`. Names and phone numbers belong to the shared account and cannot be changed by a school through this route. Disabling the teacher clears that school's assignments without disabling their global account or another school's membership.

CORS reflects only origins configured in `CORS_ORIGINS`. For example:

```dotenv
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,https://portal.example.com
```

Use exact origins (scheme, hostname and port), without paths or trailing slashes. Add every frontend origin you use, including tenant-specific hosts. Requests without an Origin header remain usable by server clients. Disallowed browser origins receive no permission header; CORS is a browser control, and authentication still governs API access.

No new dependencies or database migration are required for this batch. Build using `npm run build` before restarting the compiled backend.

Verification: the regression suite passed 58 tests, and the isolated PostgreSQL suite passed 49 tests. New HTTP checks cover staff permissions, tenant isolation, parsed pagination, pending invitations, credential rejection, CORS and school-specific deactivation. The live database and email providers were not used.

Further work remains: assignment/curriculum consistency under concurrent edits, import validation and atomicity, general notification delivery, and final staging/deployment checks against the product roadmap. This batch does not certify production readiness.
