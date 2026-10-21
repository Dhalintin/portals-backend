CREATE TABLE "SchoolInvitation" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "email" TEXT NOT NULL,
 "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "phone" TEXT, "role" "OrgRole" NOT NULL,
 "parentId" TEXT, "tokenHash" TEXT NOT NULL, "invitedById" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SchoolInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolInvitation_tokenHash_key" ON "SchoolInvitation"("tokenHash");
CREATE INDEX "SchoolInvitation_organizationId_email_idx" ON "SchoolInvitation"("organizationId", "email");
ALTER TABLE "SchoolInvitation" ADD CONSTRAINT "SchoolInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolInvitation" ADD CONSTRAINT "SchoolInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "AuthEmail" (
 "id" TEXT NOT NULL, "recipient" TEXT NOT NULL, "subject" TEXT NOT NULL, "encryptedText" TEXT,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3),
 "expiresAt" TIMESTAMP(3) NOT NULL, "sentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AuthEmail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthEmail_status_nextAttemptAt_idx" ON "AuthEmail"("status", "nextAttemptAt");
