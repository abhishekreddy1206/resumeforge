-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "cachedInsights" TEXT;
ALTER TABLE "Profile" ADD COLUMN "cachedInsightsAt" DATETIME;
ALTER TABLE "Profile" ADD COLUMN "insightsCacheFingerprint" TEXT;
