-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT NOT NULL,
    "skills" TEXT,
    "requirements" TEXT,
    "atsKeywords" TEXT,
    "seniority" TEXT,
    "roleArchetype" TEXT,
    "sponsorship" TEXT,
    "terminologyMap" TEXT,
    "matchResult" TEXT,
    "matchedAt" DATETIME,
    "roleCategory" TEXT,
    "roleCategoryConf" INTEGER,
    "roleCategoryCandidate" TEXT,
    "roleCategoryVersion" TEXT,
    "roleClassifiedAt" DATETIME,
    "aiModel" TEXT NOT NULL DEFAULT 'sonnet',
    "source" TEXT,
    "canonicalUrl" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" DATETIME,
    "callbackReceived" BOOLEAN NOT NULL DEFAULT false,
    "callbackAt" DATETIME,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejectedAt" DATETIME,
    "coverLetter" TEXT,
    "interviewPrep" TEXT,
    "pipelineStatus" TEXT,
    "pipelineStage" TEXT,
    "pipelineError" TEXT,
    "pipelineStartedAt" DATETIME,
    "pipelineEndedAt" DATETIME,
    "pipelineCheckpoint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Job" ("aiModel", "applied", "appliedAt", "atsKeywords", "callbackAt", "callbackReceived", "canonicalUrl", "company", "coverLetter", "createdAt", "description", "id", "interviewPrep", "matchResult", "matchedAt", "pipelineCheckpoint", "pipelineEndedAt", "pipelineError", "pipelineStage", "pipelineStartedAt", "pipelineStatus", "requirements", "roleArchetype", "roleCategory", "roleCategoryCandidate", "roleCategoryConf", "roleCategoryVersion", "roleClassifiedAt", "seniority", "skills", "source", "sponsorship", "terminologyMap", "title", "url") SELECT "aiModel", "applied", "appliedAt", "atsKeywords", "callbackAt", "callbackReceived", "canonicalUrl", "company", "coverLetter", "createdAt", "description", "id", "interviewPrep", "matchResult", "matchedAt", "pipelineCheckpoint", "pipelineEndedAt", "pipelineError", "pipelineStage", "pipelineStartedAt", "pipelineStatus", "requirements", "roleArchetype", "roleCategory", "roleCategoryCandidate", "roleCategoryConf", "roleCategoryVersion", "roleClassifiedAt", "seniority", "skills", "source", "sponsorship", "terminologyMap", "title", "url" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_roleCategory_idx" ON "Job"("roleCategory");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
