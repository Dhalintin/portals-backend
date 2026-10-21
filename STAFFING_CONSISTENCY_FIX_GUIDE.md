# Batch 9: staffing and curriculum consistency

Both teacher and class routes now share staffing checks. Assignment validation and writes run under the school transaction lock, alongside teacher removal, membership changes, subject archival and curriculum removal. An assignment requires an active user with an active teaching membership in the same school, an active class and subject, and a class curriculum link. The existing class API policy allowing teaching assignments to teachers, exam officers, principals, school administrators, proprietors and staff remains.

One class teacher per school is enforced consistently through both APIs. Subject teachers can cover multiple classes. A bulk teacher assignment request is atomic: duplicate pairs are rejected, batches are bounded at 500 pairs, and occupied slots return HTTP 409 without changing the current assignments. To intentionally replace another teacher, use the single class/subject assignment endpoint. An empty bulk list clears that teacher's subject assignments.

Disabling a teacher or changing membership to a role outside the teaching roles clears that school's staffing links. Archiving a subject clears its teacher assignments; deactivating a class clears both its class teacher and subject teachers. Curriculum links and historical records remain. Reactivation requires explicit reassignment.

The teacher-facing class subject listing now includes only active subjects actually on that class's curriculum. Clearing a teacher with a null assignment remains safe and repeatable, including cleanup of inactive records. Creating or staffing an inactive class is rejected; when archiving a class, omit a non-null classTeacherId.

No new packages or migrations are required. Run `npm run build` and restart the compiled backend after updating. Existing inconsistent assignments from earlier code are not automatically repaired: review them in staging before deployment. Direct database writes or older code paths that do not use the shared school lock are outside this concurrency guarantee.

Verification: 58 regression tests and 55 isolated PostgreSQL integration tests passed. New checks exercise inactive and foreign staff, bulk rollback, occupied slots, curriculum-scoped listings, concurrent form-teacher assignment, curriculum removal races, staff/subject deactivation races, class archival and loss of teaching roles. No live database or provider was used.

Next batches remain: import validation and atomicity, notification outbox delivery, legacy feature cleanup, and staging/deployment verification. Full Excel upload/export support is a feature addition beyond the current JSON import API.
