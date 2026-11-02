ALTER TABLE "Student" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "activationCodeHash" TEXT, ADD COLUMN "activationCodeExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Student_activationCodeHash_key" ON "Student"("activationCodeHash");
-- Keep previously disabled student accounts disabled.
UPDATE "Student" s SET "portalEnabled" = false FROM "User" u WHERE s."userId" = u.id AND u."isActive" = false;
