-- AlterTable
ALTER TABLE "Pin" ADD COLUMN     "printed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "Organization_isActive_name_idx" ON "Organization"("isActive", "name");

-- CreateIndex
CREATE INDEX "Result_organizationId_termId_isPublished_idx" ON "Result"("organizationId", "termId", "isPublished");

-- CreateIndex
CREATE INDEX "Result_termId_isPublished_idx" ON "Result"("termId", "isPublished");

-- CreateIndex
CREATE INDEX "Student_organizationId_isActive_idx" ON "Student"("organizationId", "isActive");
