-- CreateTable
CREATE TABLE "SavedSourceVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "savedSourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "captureMethod" TEXT,
    "publisher" TEXT,
    "publishedAt" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "reviewFlags" TEXT NOT NULL DEFAULT '[]',
    "reviewSummary" TEXT,
    "changeType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedSourceVersion_savedSourceId_fkey" FOREIGN KEY ("savedSourceId") REFERENCES "SavedSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GuideSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guideId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "savedSourceId" TEXT,
    "savedSourceVersionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supersededAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuideSource_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuideSource_savedSourceId_fkey" FOREIGN KEY ("savedSourceId") REFERENCES "SavedSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GuideSource_savedSourceVersionId_fkey" FOREIGN KEY ("savedSourceVersionId") REFERENCES "SavedSourceVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GuideSource" ("content", "createdAt", "guideId", "id", "title", "type", "url") SELECT "content", "createdAt", "guideId", "id", "title", "type", "url" FROM "GuideSource";
DROP TABLE "GuideSource";
ALTER TABLE "new_GuideSource" RENAME TO "GuideSource";
CREATE INDEX "GuideSource_guideId_isActive_idx" ON "GuideSource"("guideId", "isActive");
CREATE INDEX "GuideSource_guideId_savedSourceId_isActive_idx" ON "GuideSource"("guideId", "savedSourceId", "isActive");
CREATE INDEX "GuideSource_savedSourceId_isActive_idx" ON "GuideSource"("savedSourceId", "isActive");
CREATE INDEX "GuideSource_savedSourceVersionId_idx" ON "GuideSource"("savedSourceVersionId");
CREATE TABLE "new_GuideVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guideId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "changeDescription" TEXT,
    "snapshotSemantics" TEXT NOT NULL DEFAULT 'current_head',
    "sourceRefs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuideVersion_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GuideVersion" ("changeDescription", "content", "createdAt", "guideId", "id", "version") SELECT "changeDescription", "content", "createdAt", "guideId", "id", "version" FROM "GuideVersion";
DROP TABLE "GuideVersion";
ALTER TABLE "new_GuideVersion" RENAME TO "GuideVersion";
CREATE UNIQUE INDEX "GuideVersion_guideId_version_key" ON "GuideVersion"("guideId", "version");
CREATE TABLE "new_SavedSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "reviewFlags" TEXT NOT NULL DEFAULT '[]',
    "reviewSummary" TEXT,
    "captureMethod" TEXT,
    "publisher" TEXT,
    "publishedAt" TEXT,
    "lastRefreshedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedSource_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedSource" ("captureMethod", "content", "createdAt", "id", "lastRefreshedAt", "profileId", "publishedAt", "publisher", "title", "type", "url") SELECT "captureMethod", "content", "createdAt", "id", "lastRefreshedAt", "profileId", "publishedAt", "publisher", "title", "type", "url" FROM "SavedSource";
DROP TABLE "SavedSource";
ALTER TABLE "new_SavedSource" RENAME TO "SavedSource";
CREATE UNIQUE INDEX "SavedSource_profileId_url_key" ON "SavedSource"("profileId", "url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SavedSourceVersion_savedSourceId_createdAt_idx" ON "SavedSourceVersion"("savedSourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedSourceVersion_savedSourceId_version_key" ON "SavedSourceVersion"("savedSourceId", "version");
