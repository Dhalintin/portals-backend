CREATE TABLE "InvoiceBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvoiceBatch_organizationId_idempotencyKey_key" ON "InvoiceBatch"("organizationId", "idempotencyKey");
ALTER TABLE "InvoiceBatch" ADD CONSTRAINT "InvoiceBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD COLUMN "batchId" TEXT;
CREATE INDEX "Invoice_batchId_idx" ON "Invoice"("batchId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InvoiceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
