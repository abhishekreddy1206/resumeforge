-- AlterTable
ALTER TABLE "SavedSource" ADD COLUMN "captureDecisionReason" TEXT;
ALTER TABLE "SavedSource" ADD COLUMN "captureDiagnostics" TEXT;

-- AlterTable
ALTER TABLE "SavedSourceVersion" ADD COLUMN "captureDecisionReason" TEXT;
ALTER TABLE "SavedSourceVersion" ADD COLUMN "captureDiagnostics" TEXT;
