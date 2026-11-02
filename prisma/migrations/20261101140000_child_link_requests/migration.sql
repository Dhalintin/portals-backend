CREATE TABLE "ChildLinkRequest" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "parentId" TEXT NOT NULL,
 "childName" TEXT NOT NULL, "childKey" TEXT NOT NULL, "className" TEXT, "note" TEXT,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "studentId" TEXT, "reviewerId" TEXT,
 "reviewNote" TEXT, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ChildLinkRequest_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ChildLinkRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChildLinkRequest_status_check" CHECK ("status" IN ('PENDING','APPROVED','DECLINED'))
);
CREATE UNIQUE INDEX "ChildLinkRequest_parentId_childKey_key" ON "ChildLinkRequest"("parentId", "childKey");
CREATE INDEX "ChildLinkRequest_organizationId_status_createdAt_idx" ON "ChildLinkRequest"("organizationId", "status", "createdAt");
