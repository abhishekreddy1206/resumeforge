-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "matchScoreFloor" INTEGER NOT NULL DEFAULT 60,
    "qualityScoreFloor" INTEGER NOT NULL DEFAULT 75,
    "defaultAiModel" TEXT NOT NULL DEFAULT 'sonnet',
    "claudeCliConcurrency" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
