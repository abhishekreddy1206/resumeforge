-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "cachedGaps" TEXT;
ALTER TABLE "Profile" ADD COLUMN "cachedGapsAt" DATETIME;
ALTER TABLE "Profile" ADD COLUMN "cachedRecommendations" TEXT;
ALTER TABLE "Profile" ADD COLUMN "cachedRecommendationsAt" DATETIME;
ALTER TABLE "Profile" ADD COLUMN "gapsCacheFingerprint" TEXT;
ALTER TABLE "Profile" ADD COLUMN "recsCacheFingerprint" TEXT;
