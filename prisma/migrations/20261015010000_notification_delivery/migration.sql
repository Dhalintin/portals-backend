ALTER TABLE "NotificationOutbox" ADD COLUMN "eventKey" TEXT,
 ADD COLUMN "requestHash" TEXT,
 ADD COLUMN "lockedAt" TIMESTAMP(3),
 ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "NotificationOutbox_organizationId_eventKey_key" ON "NotificationOutbox"("organizationId", "eventKey");
