import { prisma } from "@/lib/db";
import type { GapAggregation } from "@/lib/claude/skills/gap-aggregator";

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export function computeGapsFingerprint(
  jobs: Array<{ id: string; matchedAt: Date | null }>
): string {
  const sorted = [...jobs].sort((a, b) => a.id.localeCompare(b.id));
  return hashString(JSON.stringify(sorted.map((j) => [j.id, j.matchedAt?.toISOString()])));
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

// Transitional stub: recommendations cache was dropped in the insights-taxonomy-redesign
// schema change. Task 11 replaces this entirely with curated per-category topic ranking.
// Returning [] here keeps consumers compiling until the rewrite lands.
export async function refreshRecommendationsCache(): Promise<never[]> {
  return [];
}
