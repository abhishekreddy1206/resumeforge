-- AlterTable
ALTER TABLE "Job" ADD COLUMN "pipelineEndedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "pipelineError" TEXT;
ALTER TABLE "Job" ADD COLUMN "pipelineStage" TEXT;
ALTER TABLE "Job" ADD COLUMN "pipelineStartedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "pipelineStatus" TEXT;
