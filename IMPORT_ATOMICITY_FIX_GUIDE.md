# Batch 10: mapped JSON imports

Student and parent imports now validate rows and database references inside the shared school transaction. Records, student enrollments, parent/child links, the completed batch and its audit record commit together. A failed commit creates none of them. Inserts are batched rather than issuing one transaction query per row. Requests remain bounded to 2,000 mapped JSON rows and the existing 2 MB HTTP body limit.

`POST /api/v1/imports/students` and `/api/v1/imports/parents` default to `dryRun: true`. A preview returns row-numbered errors, validCount, errorCount and canCommit. Student previews also return seatsLeft and capExceeded. Preview never reserves an import key or creates records. Row numbers must be unique positive integers. Unknown row fields, blank names, malformed email addresses, duplicate admissions and invalid class references are reported against the row. Dates of birth must be real calendar dates in YYYY-MM-DD format between 1900 and today. Empty optional text is normalized to null; emails are trimmed and lowercased.

A committed import requires an idempotencyKey of 8–128 characters. Generate one UUID for each intended batch and retain it through network retries. Send the same mapped rows again with that key; the result returns the original batchId and created count with replayed: true. Changing rows or session with an already completed key returns HTTP 409. Keys are scoped to school and import type. Do not generate a fresh key merely because a response was lost. Keep the original rows when moving from preview to commit; preview samples are output records rather than request templates.

```json
{
  "dryRun": false,
  "idempotencyKey": "retain-this-batch-uuid",
  "sessionId": "school-academic-session-uuid",
  "rows": [{
    "rowNumber": 2,
    "admissionNumber": "S010",
    "firstName": "Ada",
    "lastName": "Okoro",
    "dateOfBirth": "2015-02-28",
    "className": "Grade 1",
    "classArm": "A"
  }]
}
```

A supplied session must belong to the school, and every row must identify an active class when creating session enrollments. Class matching uses trimmed, case-insensitive name and arm; ambiguous matches are rejected. Admission comparisons within imports are also trimmed and case-insensitive. The database's existing exact admission uniqueness constraint is unchanged; direct or other writers still need consistent admission formatting.

Parent rows can include studentAdmissionNumber and relation. Matching uses active students in the current school and rejects ambiguous admission matches. Rows with identical names and contact details can create one parent profile with multiple child links. Conflicting profiles sharing a contact, repeated child links, and contacts already present in that school produce errors. Existing parents must use the parent update/link API; imports do not merge them automatically or create login accounts. Without contacts, separate child rows create separate profiles because names alone cannot establish identity.

Deploy the new `20261015001000_import_batches` migration using the normal staging/production migration process before starting this version, then run `npm run build`. No new package is required. The live database has not been migrated by this task. The separate student bulk-create endpoint retains its explicitly partial per-row behavior; use the import endpoints when an entire batch must succeed together.

Excel file uploads, templates and XLSX exports are still separate feature work. The next fix batch is general notification outbox delivery, followed by legacy cleanup and staging/deployment verification.

Verification: 58 regression tests and 62 isolated PostgreSQL integration tests passed. The new checks cover previews, invalid rows, atomic retries, changed-key conflicts, school isolation, grouped parent profiles, subscription races and rollback after a deliberately forced audit failure. The configured live database was not used.

All 24 migrations replayed successfully in a separate private PostgreSQL database; migration comparison reported no schema drift.
