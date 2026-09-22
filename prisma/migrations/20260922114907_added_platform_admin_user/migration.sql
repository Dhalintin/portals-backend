-- AlterEnum
ALTER TYPE "GlobalRole" ADD VALUE 'PLATFORM_ADMIN';

-- CreateTable
CREATE TABLE "PlatformAdminAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdminAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAdminAssignment_userId_idx" ON "PlatformAdminAssignment"("userId");

-- CreateIndex
CREATE INDEX "PlatformAdminAssignment_organizationId_idx" ON "PlatformAdminAssignment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdminAssignment_userId_organizationId_key" ON "PlatformAdminAssignment"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "PlatformAdminAssignment" ADD CONSTRAINT "PlatformAdminAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAdminAssignment" ADD CONSTRAINT "PlatformAdminAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAdminAssignment" ADD CONSTRAINT "PlatformAdminAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
