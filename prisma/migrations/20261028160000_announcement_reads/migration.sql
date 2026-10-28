CREATE TABLE "AnnouncementRead" (
 "announcementId" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId", "userId"),
 CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");
ALTER TABLE "AnnouncementRead" ENABLE ROW LEVEL SECURITY;
