/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,classTeacherId]` on the table `Class` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "Class_classTeacherId_idx" ON "Class"("classTeacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_organizationId_classTeacherId_key" ON "Class"("organizationId", "classTeacherId");
