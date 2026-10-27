CREATE TABLE "ExamTimetable" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "termId" TEXT NOT NULL,
 "title" TEXT NOT NULL DEFAULT 'Exam timetable', "entries" JSONB NOT NULL DEFAULT '[]', "version" INTEGER NOT NULL DEFAULT 1,
 "publishedSnapshot" JSONB, "publishedVersion" INTEGER, "publishedAt" TIMESTAMP(3),
 "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExamTimetable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ExamTimetable_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExamTimetable_organizationId_termId_key" ON "ExamTimetable"("organizationId", "termId");
ALTER TABLE "ExamTimetable" ENABLE ROW LEVEL SECURITY;
