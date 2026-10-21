ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED';
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;
CREATE UNIQUE INDEX "Payment_organizationId_idempotencyKey_key" ON "Payment"("organizationId", "idempotencyKey");
ALTER TABLE "PaymentAllocation" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "Receipt" ADD COLUMN "voidedAt" TIMESTAMP(3);
