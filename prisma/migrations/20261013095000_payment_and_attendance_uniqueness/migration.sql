-- Existing duplicates must be reconciled before deploying this migration.
-- Nothing is silently deleted; a duplicate causes the migration to fail.
BEGIN;
DROP INDEX IF EXISTS "AttendanceRecord_organizationId_clientKey_idx";
CREATE UNIQUE INDEX "AttendanceRecord_organizationId_clientKey_key"
  ON "AttendanceRecord"("organizationId", "clientKey");
DROP INDEX IF EXISTS "Payment_providerReference_idx";
CREATE UNIQUE INDEX "Payment_providerReference_key"
  ON "Payment"("providerReference");
COMMIT;
