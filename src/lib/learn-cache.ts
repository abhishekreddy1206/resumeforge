import { prisma } from "@/lib/db";
import type { GapAggregation } from "@/lib/claude/skills/gap-aggregator";
import type { GuideRecommendation } from "@/lib/claude/skills/guide-recommender";

/**
 * Simple string hash for cache fingerprints.
 * No crypto needed — single-user cache key, not security-sensitive.
 */
function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * Fingerprint for gap aggregation cache.
 * Changes when: job matched, job re-matched, job deleted.
 */
export function computeGapsFingerprint(
  jobs: Array<{ id: string; matchedAt: Date | null }>
): string {
  const sorted = [...jobs].sort((a, b) => a.id.localeCompare(b.id));
  return hashString(JSON.stringify(sorted.map((j) => [j.id, j.matchedAt?.toISOString()])));
}

/**
 * Fingerprint for recommendations cache.
 * Changes when: gaps change OR a guide is created/deleted.
 */
export function computeRecsFingerprint(
  gapsFingerprint: string,
  guideTopics: string[]
): string {
  return hashString(gapsFingerprint + JSON.stringify([...guideTopics].sort()));
}

export async function getCachedGaps(
  profileId: string,
  currentFingerprint: string
): Promise<GapAggregation | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { cachedGaps: true, gapsCacheFingerprint: true },
  });
  if (profile?.gapsCacheFingerprint === currentFingerprint && profile.cachedGaps) {
    return JSON.parse(profile.cachedGaps) as GapAggregation;
  }
  return null;
}

export async function setCachedGaps(
  profileId: string,
  gaps: GapAggregation,
  fingerprint: string
): Promise<void> {
  await prisma.profile.update({
    where: { id: profileId },
    data: {
      cachedGaps: JSON.stringify(gaps),
      cachedGapsAt: new Date(),
      gapsCacheFingerprint: fingerprint,
    },
  });
}

export async function getCachedRecommendations(
  profileId: string,
  currentFingerprint: string
): Promise<GuideRecommendation[] | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { cachedRecommendations: true, recsCacheFingerprint: true },
  });
  if (profile?.recsCacheFingerprint === currentFingerprint && profile.cachedRecommendations) {
    return JSON.parse(profile.cachedRecommendations) as GuideRecommendation[];
  }
  return null;
}

export async function setCachedRecommendations(
  profileId: string,
  recs: GuideRecommendation[],
  fingerprint: string
): Promise<void> {
  await prisma.profile.update({
    where: { id: profileId },
    data: {
      cachedRecommendations: JSON.stringify(recs),
      cachedRecommendationsAt: new Date(),
      recsCacheFingerprint: fingerprint,
    },
  });
}
