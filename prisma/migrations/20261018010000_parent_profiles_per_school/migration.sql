-- Preserve existing profiles and links while allowing one account in multiple schools.
DROP INDEX "Parent_userId_key";
CREATE UNIQUE INDEX "Parent_organizationId_userId_key" ON "Parent"("organizationId", "userId");
CREATE INDEX "Parent_userId_idx" ON "Parent"("userId");
