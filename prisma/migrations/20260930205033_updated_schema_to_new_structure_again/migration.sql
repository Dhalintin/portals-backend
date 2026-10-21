/*
  Warnings:

  - The values [VOID] on the enum `InvoiceStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `clientMutationId` on the `AttendanceRecord` table. All the data in the column will be lost.
  - You are about to drop the column `rules` on the `GradeScale` table. All the data in the column will be lost.
  - You are about to drop the column `number` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `relationship` on the `ParentStudent` table. All the data in the column will be lost.
  - You are about to drop the column `channel` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `number` on the `Receipt` table. All the data in the column will be lost.
  - You are about to drop the column `workflowStatus` on the `Result` table. All the data in the column will be lost.
  - You are about to drop the column `planCode` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the `OrganizationPayment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Permission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Pin` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RolePermission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Staff` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Teacher` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRole` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[organizationId,invoiceNumber]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,receiptNumber]` on the table `Receipt` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `action` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `FeeCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bands` to the `GradeScale` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `GradeScale` table without a default value. This is not possible if the table is not empty.
  - Added the required column `invoiceNumber` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `ParentStudent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amountNgn` to the `Receipt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `receiptNumber` to the `Receipt` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'STUDENT_CREATED', 'STUDENT_UPDATED', 'STUDENT_ARCHIVED', 'FEE_CREATED', 'INVOICE_CREATED', 'PAYMENT_CREATED', 'PAYMENT_REFUNDED', 'RECEIPT_GENERATED', 'RESULT_SUBMITTED', 'RESULT_APPROVED', 'RESULT_PUBLISHED', 'ATTENDANCE_MODIFIED', 'USER_INVITED', 'ROLE_CHANGED', 'SETTINGS_CHANGED', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'OVERDUE');
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "public"."InvoiceStatus_old";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'ISSUED';
COMMIT;

-- DropForeignKey
ALTER TABLE "OrganizationPayment" DROP CONSTRAINT "OrganizationPayment_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationPayment" DROP CONSTRAINT "OrganizationPayment_recordedById_fkey";

-- DropForeignKey
ALTER TABLE "Pin" DROP CONSTRAINT "Pin_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Pin" DROP CONSTRAINT "Pin_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Pin" DROP CONSTRAINT "Pin_termId_fkey";

-- DropForeignKey
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_permissionId_fkey";

-- DropForeignKey
ALTER TABLE "Staff" DROP CONSTRAINT "Staff_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Teacher" DROP CONSTRAINT "Teacher_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Teacher" DROP CONSTRAINT "Teacher_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- DropIndex
DROP INDEX "AttendanceRecord_organizationId_clientMutationId_key";

-- DropIndex
DROP INDEX "GradeScale_organizationId_name_key";

-- DropIndex
DROP INDEX "Invoice_organizationId_number_key";

-- DropIndex
DROP INDEX "Payment_organizationId_paidAt_idx";

-- DropIndex
DROP INDEX "Payment_providerReference_key";

-- DropIndex
DROP INDEX "Receipt_organizationId_number_key";

-- DropIndex
DROP INDEX "Receipt_paymentId_key";

-- AlterTable
ALTER TABLE "AttendanceRecord" DROP COLUMN "clientMutationId",
ADD COLUMN     "clientKey" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "action",
ADD COLUMN     "action" "AuditAction" NOT NULL;

-- AlterTable
ALTER TABLE "FeeCategory" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "GradeScale" DROP COLUMN "rules",
ADD COLUMN     "bands" JSONB NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "name" SET DEFAULT 'Default',
ALTER COLUMN "isDefault" SET DEFAULT true;

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "number",
ADD COLUMN     "invoiceNumber" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ParentStudent" DROP COLUMN "relationship",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "relation" TEXT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "channel",
DROP COLUMN "metadata",
ADD COLUMN     "note" TEXT,
ADD COLUMN     "providerPayload" JSONB,
ADD COLUMN     "recordedById" TEXT;

-- AlterTable
ALTER TABLE "Receipt" DROP COLUMN "number",
ADD COLUMN     "amountNgn" INTEGER NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "receiptNumber" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Result" DROP COLUMN "workflowStatus",
ADD COLUMN     "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "dateOfBirth" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "planCode",
ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';

-- DropTable
DROP TABLE "OrganizationPayment";

-- DropTable
DROP TABLE "Permission";

-- DropTable
DROP TABLE "Pin";

-- DropTable
DROP TABLE "RolePermission";

-- DropTable
DROP TABLE "Staff";

-- DropTable
DROP TABLE "Teacher";

-- DropTable
DROP TABLE "UserRole";

-- DropEnum
DROP TYPE "PinStatus";

-- DropEnum
DROP TYPE "ResultWorkflowStatus";

-- DropEnum
DROP TYPE "SubscriptionPlanCode";

-- CreateIndex
CREATE INDEX "Announcement_isActive_publishedAt_idx" ON "Announcement"("isActive", "publishedAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_idx" ON "AttendanceRecord"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organizationId_clientKey_idx" ON "AttendanceRecord"("organizationId", "clientKey");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "ClassSubject_classId_idx" ON "ClassSubject"("classId");

-- CreateIndex
CREATE INDEX "ClassSubject_subjectId_idx" ON "ClassSubject"("subjectId");

-- CreateIndex
CREATE INDEX "ClassSubjectTeacher_classId_idx" ON "ClassSubjectTeacher"("classId");

-- CreateIndex
CREATE INDEX "FeeCategory_organizationId_idx" ON "FeeCategory"("organizationId");

-- CreateIndex
CREATE INDEX "FeeStructure_termId_idx" ON "FeeStructure"("termId");

-- CreateIndex
CREATE INDEX "FeeStructure_sessionId_idx" ON "FeeStructure"("sessionId");

-- CreateIndex
CREATE INDEX "FeeStructureItem_feeCategoryId_idx" ON "FeeStructureItem"("feeCategoryId");

-- CreateIndex
CREATE INDEX "File_uploaderId_idx" ON "File"("uploaderId");

-- CreateIndex
CREATE INDEX "GradeScale_organizationId_idx" ON "GradeScale"("organizationId");

-- CreateIndex
CREATE INDEX "Invoice_termId_idx" ON "Invoice"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_invoiceNumber_key" ON "Invoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_feeCategoryId_idx" ON "InvoiceItem"("feeCategoryId");

-- CreateIndex
CREATE INDEX "ParentStudent_organizationId_idx" ON "ParentStudent"("organizationId");

-- CreateIndex
CREATE INDEX "Payment_providerReference_idx" ON "Payment"("providerReference");

-- CreateIndex
CREATE INDEX "Payment_organizationId_providerReference_idx" ON "Payment"("organizationId", "providerReference");

-- CreateIndex
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_invoiceId_idx" ON "Receipt"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_organizationId_receiptNumber_key" ON "Receipt"("organizationId", "receiptNumber");

-- CreateIndex
CREATE INDEX "Result_isPublished_idx" ON "Result"("isPublished");

-- CreateIndex
CREATE INDEX "Result_termId_isPublished_idx" ON "Result"("termId", "isPublished");

-- CreateIndex
CREATE INDEX "Score_subjectId_idx" ON "Score"("subjectId");

-- CreateIndex
CREATE INDEX "Student_admissionNumber_idx" ON "Student"("admissionNumber");

-- CreateIndex
CREATE INDEX "StudentEnrollment_sessionId_idx" ON "StudentEnrollment"("sessionId");

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
