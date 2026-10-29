ALTER TABLE "ExamTimetable" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'EXAM', ADD COLUMN "format" JSONB;
DROP INDEX "ExamTimetable_organizationId_termId_key";
CREATE UNIQUE INDEX "ExamTimetable_organizationId_termId_kind_key" ON "ExamTimetable"("organizationId", "termId", "kind");
