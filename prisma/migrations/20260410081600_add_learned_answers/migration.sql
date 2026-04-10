-- CreateTable
CREATE TABLE "LearnedAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalizedQ" TEXT NOT NULL,
    "originalQ" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'text',
    "answer" TEXT NOT NULL,
    "options" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "source" TEXT NOT NULL DEFAULT 'observed',
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LearnedAnswer_normalizedQ_idx" ON "LearnedAnswer"("normalizedQ");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedAnswer_normalizedQ_answer_key" ON "LearnedAnswer"("normalizedQ", "answer");
