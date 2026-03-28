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
    "sponsorship" TEXT,
    "terminologyMap" TEXT,
    "matchResult" TEXT,
    "matchedAt" DATETIME,
    "aiModel" TEXT NOT NULL DEFAULT 'sonnet',
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Job" ("applied", "appliedAt", "atsKeywords", "company", "createdAt", "description", "id", "matchResult", "matchedAt", "requirements", "seniority", "skills", "sponsorship", "terminologyMap", "title", "url") SELECT "applied", "appliedAt", "atsKeywords", "company", "createdAt", "description", "id", "matchResult", "matchedAt", "requirements", "seniority", "skills", "sponsorship", "terminologyMap", "title", "url" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
