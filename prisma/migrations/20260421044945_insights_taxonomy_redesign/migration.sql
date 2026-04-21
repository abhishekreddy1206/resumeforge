/*
  Warnings:

  - You are about to drop the column `cachedRecommendations` on the `Profile` table. All the data in the column will be lost.
  - You are about to drop the column `cachedRecommendationsAt` on the `Profile` table. All the data in the column will be lost.
  - You are about to drop the column `recsCacheFingerprint` on the `Profile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Job" ADD COLUMN "roleCategory" TEXT;
ALTER TABLE "Job" ADD COLUMN "roleCategoryCandidate" TEXT;
ALTER TABLE "Job" ADD COLUMN "roleCategoryConf" INTEGER;
ALTER TABLE "Job" ADD COLUMN "roleCategoryVersion" TEXT;
ALTER TABLE "Job" ADD COLUMN "roleClassifiedAt" DATETIME;

-- CreateTable
CREATE TABLE "TaxonomyRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "suggestedName" TEXT NOT NULL,
    "supportingJobCount" INTEGER NOT NULL,
    "exampleJobIds" TEXT NOT NULL,
    "signalKeywords" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewNotes" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "additionalEmails" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "summary" TEXT,
    "linkedin" TEXT,
    "github" TEXT,
    "website" TEXT,
    "twitter" TEXT,
    "pinterest" TEXT,
    "stackoverflowId" TEXT,
    "recommendations" TEXT,
    "lastEnrichedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cachedGaps" TEXT,
    "cachedGapsAt" DATETIME,
    "gapsCacheFingerprint" TEXT,
    "cachedInsights" TEXT,
    "cachedInsightsAt" DATETIME,
    "insightsCacheFingerprint" TEXT,
    "insightsSettings" TEXT
);
INSERT INTO "new_Profile" ("additionalEmails", "cachedGaps", "cachedGapsAt", "cachedInsights", "cachedInsightsAt", "createdAt", "email", "gapsCacheFingerprint", "github", "id", "insightsCacheFingerprint", "lastEnrichedAt", "linkedin", "location", "name", "phone", "pinterest", "recommendations", "stackoverflowId", "summary", "twitter", "updatedAt", "website") SELECT "additionalEmails", "cachedGaps", "cachedGapsAt", "cachedInsights", "cachedInsightsAt", "createdAt", "email", "gapsCacheFingerprint", "github", "id", "insightsCacheFingerprint", "lastEnrichedAt", "linkedin", "location", "name", "phone", "pinterest", "recommendations", "stackoverflowId", "summary", "twitter", "updatedAt", "website" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaxonomyRecommendation_status_createdAt_idx" ON "TaxonomyRecommendation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_roleCategory_idx" ON "Job"("roleCategory");
