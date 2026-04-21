import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";
import { loadInsightsSettingsFromProfile } from "@/lib/insights/settings";

/**
 * Enqueue classification for the given job IDs, batched per the user's
 * configured batch size. Single-user app — all jobs belong to the one profile.
 */
export async function enqueueJobClassifications(jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;

  const profile = await prisma.profile.findFirst({
    select: { id: true, insightsSettings: true },
  });
  if (!profile) return;

  const settings = loadInsightsSettingsFromProfile({
    insightsSettings: profile.insightsSettings ?? null,
  });
  const batchSize = settings.classificationBatchSize;

  for (let i = 0; i < jobIds.length; i += batchSize) {
    const chunk = jobIds.slice(i, i + batchSize);
    await enqueueJob(
      "classify-jobs-batch",
      { jobIds: chunk, profileId: profile.id },
      {
        priority: 5,
        entityType: "Profile",
        entityId: profile.id,
        groupKey: `classify:${profile.id}`,
      }
    );
  }
}

/**
 * Pure helper — split an array into chunks of at most `batchSize`.
 * Exported for unit-testing the chunking logic in isolation.
 */
export function chunkJobIds(jobIds: string[], batchSize: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < jobIds.length; i += batchSize) {
    chunks.push(jobIds.slice(i, i + batchSize));
  }
  return chunks;
}
