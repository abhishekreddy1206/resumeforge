import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aggregateGaps, recommendGuides } from "@/lib/claude";
import {
  computeGapsFingerprint,
  computeRecsFingerprint,
  getCachedGaps,
  setCachedGaps,
  getCachedRecommendations,
  setCachedRecommendations,
} from "@/lib/learn-cache";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst({ select: { id: true } });
    if (!profile) return NextResponse.json([]);

    const jobs = await prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: { id: true, title: true, company: true, matchResult: true, matchedAt: true, terminologyMap: true },
    });

    if (jobs.length < 2) return NextResponse.json([]);

    const guideTopics = (
      await prisma.guide.findMany({ select: { topic: true } })
    ).map((g) => g.topic);

    // Compute fingerprints to check cache validity
    const gapsFp = computeGapsFingerprint(jobs.map((j) => ({ id: j.id, matchedAt: j.matchedAt })));
    const recsFp = computeRecsFingerprint(gapsFp, guideTopics);

    // Fast path: full cache hit
    const cachedRecs = await getCachedRecommendations(profile.id, recsFp);
    if (cachedRecs) {
      console.log("[recommendations] Cache hit — returning cached recommendations");
      return NextResponse.json(cachedRecs);
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

    if (jobMatchData.length < 2) return NextResponse.json([]);

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

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
