-- AlterTable
ALTER TABLE "Guide" ADD COLUMN "lastAsyncError" TEXT;
ALTER TABLE "Guide" ADD COLUMN "lastAsyncStage" TEXT;

-- AlterTable
ALTER TABLE "SavedSource" ADD COLUMN "captureMethod" TEXT;
ALTER TABLE "SavedSource" ADD COLUMN "publisher" TEXT;
ALTER TABLE "SavedSource" ADD COLUMN "publishedAt" TEXT;
ALTER TABLE "SavedSource" ADD COLUMN "lastRefreshedAt" DATETIME;
