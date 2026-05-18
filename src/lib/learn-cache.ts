import { prisma } from "@/lib/db";
import type { GapAggregation } from "@/lib/claude/skills/gap-aggregator";
import { hashJobSubstance } from "@/lib/cache-fingerprints";

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export function computeGapsFingerprint(
  jobs: Array<{
    id: string;
    matchedAt: Date | null;
    matchResult?: string | null;
    terminologyMap?: string | null;
    description?: string | null;
  }>
): string {
  const sorted = [...jobs].sort((a, b) => a.id.localeCompare(b.id));
  return hashString(
    JSON.stringify(
      sorted.map((j) => [
        j.id,
        hashJobSubstance({
          id: j.id,
          matchedAt: j.matchedAt,
          matchResult: j.matchResult ?? null,
          terminologyMap: j.terminologyMap ?? null,
          description: j.description ?? null,
        }),
      ]),
    ),
  );
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

