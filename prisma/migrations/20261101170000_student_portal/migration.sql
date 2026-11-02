ALTER TYPE "OrgRole" ADD VALUE 'STUDENT';
ALTER TABLE "Student" ADD COLUMN "userId" TEXT, ADD COLUMN "contactEmail" TEXT;
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "StudentParentRequest" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "email" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "reviewNote" TEXT, "reviewerId" TEXT, "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "StudentParentRequest_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "StudentParentRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "StudentParentRequest_status_check" CHECK ("status" IN ('PENDING','APPROVED','DECLINED'))
);
CREATE UNIQUE INDEX "StudentParentRequest_studentId_email_key" ON "StudentParentRequest"("studentId","email");
CREATE INDEX "StudentParentRequest_organizationId_status_createdAt_idx" ON "StudentParentRequest"("organizationId","status","createdAt");
