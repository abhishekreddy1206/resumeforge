-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "parentJobId" TEXT,
    "groupKey" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "BackgroundJob_status_priority_createdAt_idx" ON "BackgroundJob"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_entityId_entityType_status_idx" ON "BackgroundJob"("entityId", "entityType", "status");

-- CreateIndex
CREATE INDEX "BackgroundJob_parentJobId_idx" ON "BackgroundJob"("parentJobId");

-- CreateIndex
CREATE INDEX "BackgroundJob_groupKey_idx" ON "BackgroundJob"("groupKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_lockedAt_idx" ON "BackgroundJob"("lockedAt");
