CREATE TYPE "MarkingScheme" AS ENUM ('CA20_20_EXAM60', 'CA15_15_EXAM70');
ALTER TABLE "Organization" ADD COLUMN "markingScheme" "MarkingScheme" NOT NULL DEFAULT 'CA20_20_EXAM60';
ALTER TABLE "Term" ADD COLUMN "markingScheme" "MarkingScheme";
-- Existing marks retain their original scheme; no stored score or total changes.
UPDATE "Term" t SET "markingScheme" = 'CA20_20_EXAM60'
WHERE EXISTS (SELECT 1 FROM "Result" r JOIN "Score" s ON s."resultId"=r.id WHERE r."termId"=t.id);
