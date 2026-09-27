-- CreateTable
CREATE TABLE "OrganizationPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amountNgn" INTEGER NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationPayment_organizationId_idx" ON "OrganizationPayment"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationPayment_paidAt_idx" ON "OrganizationPayment"("paidAt");

-- CreateIndex
CREATE INDEX "OrganizationPayment_organizationId_paidAt_idx" ON "OrganizationPayment"("organizationId", "paidAt");

-- AddForeignKey
ALTER TABLE "OrganizationPayment" ADD CONSTRAINT "OrganizationPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationPayment" ADD CONSTRAINT "OrganizationPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
