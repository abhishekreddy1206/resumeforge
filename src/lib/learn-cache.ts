import { prisma } from "@/lib/db";
import { aggregateGaps, recommendGuides } from "@/lib/claude";
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

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Check-and-compute recommendations cache.
 * Returns cached results if fingerprint matches, otherwise runs AI calls
 * and updates the cache. Called eagerly from trigger points (auto-pipeline,
 * guide create/delete) and lazily from the GET route.
 */
export async function refreshRecommendationsCache(): Promise<GuideRecommendation[]> {
  const profile = await prisma.profile.findFirst({ select: { id: true } });
  if (!profile) return [];

  const jobs = await prisma.job.findMany({
    where: { matchResult: { not: null } },
    select: { id: true, title: true, company: true, matchResult: true, matchedAt: true, terminologyMap: true },
  });

  if (jobs.length < 2) return [];

  const guideTopics = (
    await prisma.guide.findMany({ select: { topic: true } })
  ).map((g) => g.topic);

  const gapsFp = computeGapsFingerprint(jobs.map((j) => ({ id: j.id, matchedAt: j.matchedAt })));
  const recsFp = computeRecsFingerprint(gapsFp, guideTopics);

  // Fast path: full cache hit
  const cachedRecs = await getCachedRecommendations(profile.id, recsFp);
  if (cachedRecs) {
    console.log("[recommendations] Cache hit — returning cached recommendations");
    return cachedRecs;
  }

  // Build job match data for AI calls
  interface MatchBreakdown {
    breakdown?: {
      gaps?: string[];
      bridgeableSkills?: Array<{ jobRequirement: string; yourSkill: string }>;
      directMatches?: string[];
    };
  }

  const jobMatchData = jobs
    .map((job) => {
      const match = safeJsonParse(job.matchResult) as MatchBreakdown | null;
      if (!match?.breakdown) return null;
      return {
        title: job.title,
        company: job.company,
        gaps: match.breakdown.gaps || [],
        bridgeableSkills: (match.breakdown.bridgeableSkills || []).map((b) => ({
          jobRequirement: b.jobRequirement,
          yourSkill: b.yourSkill,
        })),
        directMatches: match.breakdown.directMatches || [],
        terminologyMap: (safeJsonParse(job.terminologyMap, []) as Array<{ jdTerm: string; resumeSynonyms: string[] }>) || [],
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (jobMatchData.length < 2) return [];

  // Check if gaps are still cached (only guide topics changed)
  let gapResult = await getCachedGaps(profile.id, gapsFp);
  if (gapResult) {
    console.log("[recommendations] Gaps cache hit — only re-running recommendGuides");
  } else {
    console.log("[recommendations] Gaps cache miss — running aggregateGaps + recommendGuides");
    gapResult = await aggregateGaps(jobMatchData, {});
    await setCachedGaps(profile.id, gapResult, gapsFp);
  }

  const recommendations = await recommendGuides(
    gapResult.aggregatedGaps,
    gapResult.leverageScores,
    guideTopics,
  );

  await setCachedRecommendations(profile.id, recommendations, recsFp);

  return recommendations;
}
