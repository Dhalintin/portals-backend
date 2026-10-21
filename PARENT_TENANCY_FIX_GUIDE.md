# Parent profiles across schools

Batch fourteen allows one verified account to have a separate parent profile in
each school. The database enforces one profile per account per school, including
inactive profiles. Unlinked profiles can still be created without a login.

Invitation acceptance still requires the existing account's session or current
password. It preserves credentials, account names, existing sessions and other
schools' profiles. Existing staff memberships cannot be converted by an invitation.
Duplicate profiles in the same school require an administrator to resolve the
existing profile; acceptance never replaces its children or history.

Parent fees, published results and profile child lists check both the link's
school and the student's school. School-bound sessions select the relevant profile.
The Prisma account relation is now User.parentProfiles instead of User.parentProfile.
There is no frontend invitation payload change.

Before deploying, back up the database and run `npx prisma migrate deploy` against
the intended environment, then `npm run build`. The new migration is
20261018010000_parent_profiles_per_school; it replaces indexes without deleting
profiles or links. No additional dependencies are needed.

Verification uses regression tests, disposable PostgreSQL integration tests and
migration replay/drift checking. No live database or email provider is used.

This does not complete deployment readiness. One role per account per school
remains the current policy; staff who are also parents in the same school need a
separate product decision before adding multiple roles. Staging verification of
migrations, school access, email delivery, payments, workers, backups and restore
is still required. Optional transports and spreadsheet features remain separate work.

Validation for this batch: 58 regression tests and 81 PostgreSQL integration
tests passed. All migrations replayed in an isolated database with no schema drift.
