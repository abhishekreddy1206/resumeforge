-- Resume Quality v2 with analytics-safe migration
ALTER TABLE "Job" ADD COLUMN "roleArchetype" TEXT;

ALTER TABLE "ProfileVersion" ADD COLUMN "optimizationPlan" TEXT;
ALTER TABLE "ProfileVersion" ADD COLUMN "resumeData" TEXT;
ALTER TABLE "ProfileVersion" ADD COLUMN "scoreVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Resume" ADD COLUMN "evaluation" TEXT;
ALTER TABLE "Resume" ADD COLUMN "evaluationStatus" TEXT;
ALTER TABLE "Resume" ADD COLUMN "evaluationVersion" INTEGER;
