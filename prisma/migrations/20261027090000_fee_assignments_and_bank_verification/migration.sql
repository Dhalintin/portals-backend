ALTER TABLE "FeeStructure" ADD COLUMN "targetClassIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "autoBill" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN "feeStructureId" TEXT;
CREATE UNIQUE INDEX "Invoice_feeStructureId_studentId_key" ON "Invoice"("feeStructureId","studentId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SchoolBankAccount" ("organizationId" TEXT PRIMARY KEY,"encryptedDetails" TEXT NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SchoolBankAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "BankAccountChange" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"requesterId" TEXT NOT NULL,"email" TEXT NOT NULL,"encryptedDetails" TEXT NOT NULL,"codeHash" TEXT NOT NULL,"expectedVersion" INTEGER NOT NULL,"attempts" INTEGER NOT NULL DEFAULT 0,"expiresAt" TIMESTAMP(3) NOT NULL,"usedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BankAccountChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "BankAccountChange_organizationId_createdAt_idx" ON "BankAccountChange"("organizationId","createdAt");

ALTER TABLE "SchoolBankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccountChange" ENABLE ROW LEVEL SECURITY;
