-- CreateTable
CREATE TABLE "ApplicationProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "workAuthorized" BOOLEAN,
    "sponsorshipNeeded" BOOLEAN,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "willingToRelocate" TEXT,
    "noticePeriod" TEXT,
    "preferredWorkMode" TEXT,
    "earliestStartDate" TEXT,
    "gender" TEXT,
    "race" TEXT,
    "veteranStatus" TEXT,
    "disabilityStatus" TEXT,
    "heardAboutDefault" TEXT,
    "over18" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApplicationProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApplicationAnswer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationProfile_profileId_key" ON "ApplicationProfile"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAnswer_jobId_question_key" ON "ApplicationAnswer"("jobId", "question");
