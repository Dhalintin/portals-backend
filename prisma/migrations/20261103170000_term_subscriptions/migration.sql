-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "accessUntil" TIMESTAMP(3),
ADD COLUMN     "billingStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paymentSchedule" TEXT NOT NULL DEFAULT 'TWO_INSTALMENTS',
ADD COLUMN     "schoolSharePercent" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "TermSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "unitPriceNgn" INTEGER NOT NULL DEFAULT 300,
    "annualPrepaid" BOOLEAN NOT NULL DEFAULT false,
    "sponsorship" "SponsorshipModel" NOT NULL DEFAULT 'SCHOOL',
    "schoolSharePercent" INTEGER NOT NULL DEFAULT 100,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "balanceDueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionSeat" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT,
    "actorId" TEXT NOT NULL,
    "amountNgn" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "externalReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "checkoutUrl" TEXT,
    "annual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountNgn" INTEGER NOT NULL,

    CONSTRAINT "BillingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBillingSettings" (
    "id" TEXT NOT NULL DEFAULT 'billing',
    "bankName" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "supportEmail" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermSubscription_organizationId_balanceDueAt_idx" ON "TermSubscription"("organizationId", "balanceDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "TermSubscription_organizationId_termId_key" ON "TermSubscription"("organizationId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionSeat_invoiceId_studentId_key" ON "SubscriptionSeat"("invoiceId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_reference_key" ON "BillingPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_externalReference_key" ON "BillingPayment"("externalReference");

-- CreateIndex
CREATE INDEX "BillingPayment_status_createdAt_idx" ON "BillingPayment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_organizationId_idempotencyKey_key" ON "BillingPayment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAllocation_paymentId_invoiceId_key" ON "BillingAllocation"("paymentId", "invoiceId");

-- AddForeignKey
ALTER TABLE "TermSubscription" ADD CONSTRAINT "TermSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermSubscription" ADD CONSTRAINT "TermSubscription_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSeat" ADD CONSTRAINT "SubscriptionSeat_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TermSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TermSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAllocation" ADD CONSTRAINT "BillingAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAllocation" ADD CONSTRAINT "BillingAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TermSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


UPDATE "Subscription" SET "studentCap" = 1000000;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "billing_payment_amount" CHECK ("amountNgn" > 0), ADD CONSTRAINT "billing_payment_status" CHECK (status IN ('PENDING','CONFIRMED','REJECTED','REVERSED')), ADD CONSTRAINT "billing_payment_channel" CHECK (channel IN ('TRANSFER','PAYSTACK'));
ALTER TABLE "TermSubscription" ADD CONSTRAINT "term_billing_price" CHECK ("unitPriceNgn" IN (270,300)), ADD CONSTRAINT "term_billing_share" CHECK ("schoolSharePercent" BETWEEN 0 AND 100);
ALTER TABLE "BillingAllocation" ADD CONSTRAINT "billing_allocation_amount" CHECK ("amountNgn" > 0);

-- Map legacy sponsorship preferences to their explicit split.
UPDATE "Subscription" SET "schoolSharePercent" = CASE "sponsorship" WHEN 'PARENT' THEN 0 WHEN 'SHARED' THEN 50 ELSE 100 END;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_share_check" CHECK ("schoolSharePercent" BETWEEN 0 AND 100);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_schedule_check" CHECK ("paymentSchedule" IN ('FULL','TWO_INSTALMENTS'));
