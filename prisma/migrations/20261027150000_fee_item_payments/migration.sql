ALTER TABLE "PaymentAllocation" ADD COLUMN "itemAllocations" JSONB;
ALTER TABLE "Receipt" ADD COLUMN "items" JSONB;
