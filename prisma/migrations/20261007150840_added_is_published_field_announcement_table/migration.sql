-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "publishedAt" DROP NOT NULL;
