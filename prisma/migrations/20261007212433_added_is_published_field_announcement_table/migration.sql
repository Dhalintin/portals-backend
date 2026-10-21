-- DropIndex
DROP INDEX "Announcement_isActive_publishedAt_idx";

-- CreateIndex
CREATE INDEX "Announcement_organizationId_isPublished_isActive_idx" ON "Announcement"("organizationId", "isPublished", "isActive");

-- CreateIndex
CREATE INDEX "Announcement_isPublished_publishAt_idx" ON "Announcement"("isPublished", "publishAt");

-- CreateIndex
CREATE INDEX "Announcement_organizationId_isActive_publishedAt_idx" ON "Announcement"("organizationId", "isActive", "publishedAt");
