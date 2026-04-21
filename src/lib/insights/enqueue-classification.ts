import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";
import { loadInsightsSettingsFromProfile } from "@/lib/insights/settings";

type ProfileRow = { id: string; insightsSettings: string | null };

interface EnqueueDeps {
  findProfile?: () => Promise<ProfileRow | null>;
  enqueue?: (
    type: string,
    payload: { jobIds: string[]; profileId: string },
    options: {
      priority: number;
      entityType: string;
      entityId: string;
      groupKey: string;
    }
  ) => Promise<void>;
}

/**
 * Enqueue classification for the given job IDs. When more IDs are provided than
 * the user's configured `classificationBatchSize`, splits into multiple
 * `classify-jobs-batch` BackgroundJob rows. Single-user app: uses the first Profile.
 *
 * The optional `deps` parameter enables dependency injection for unit tests;
 * callers in production always use the one-argument form.
 */
export async function enqueueJobClassifications(
  jobIds: string[],
  deps?: EnqueueDeps
): Promise<void> {
  if (jobIds.length === 0) return;

  const findProfile =
    deps?.findProfile ??
    (() =>
      prisma.profile.findFirst({
        select: { id: true, insightsSettings: true },
      }));
  const enqueue = deps?.enqueue ?? enqueueJob;

  const profile = await findProfile();
  if (!profile) return;

  const settings = loadInsightsSettingsFromProfile({
    insightsSettings: profile.insightsSettings ?? null,
  });
  const batchSize = settings.classificationBatchSize;

  for (let i = 0; i < jobIds.length; i += batchSize) {
    const chunk = jobIds.slice(i, i + batchSize);
    await enqueue(
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
