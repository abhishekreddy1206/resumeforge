-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "briefingFingerprint" TEXT;
ALTER TABLE "Profile" ADD COLUMN "cachedBriefingPrompts" TEXT;
ALTER TABLE "Profile" ADD COLUMN "cachedBriefingPromptsAt" DATETIME;
