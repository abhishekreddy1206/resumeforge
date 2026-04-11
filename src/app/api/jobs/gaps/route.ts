import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aggregateGaps } from "@/lib/claude";
import { computeGapsFingerprint, getCachedGaps, setCachedGaps } from "@/lib/learn-cache";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * POST /api/jobs/gaps
 * Aggregates gaps across matched jobs to identify cross-job patterns,
 * leverage scores, and terminology overlap.
 * Accepts optional { jobIds: string[] } to scope analysis.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { jobIds } = body as { jobIds?: string[] };

    // Cap jobIds to prevent DoS via large IN clause + oversized LLM prompts
    if (jobIds && (!Array.isArray(jobIds) || jobIds.length > 50)) {
      return NextResponse.json(
        { error: "Provide up to 50 job IDs" },
        { status: 400 }
      );
    }

    // Load jobs with match results
    const where = {
      matchResult: { not: null },
      ...(jobIds && jobIds.length > 0 ? { id: { in: jobIds } } : {}),
    };

    const jobs = await prisma.job.findMany({
      where,
      select: {
        id: true,
        title: true,
        company: true,
        matchResult: true,
        matchedAt: true,
        terminologyMap: true,
      },
    });

    const isUnfiltered = !jobIds || jobIds.length === 0;

    // Filter to jobs that actually have match results with gaps
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

    if (jobMatchData.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 matched jobs for cross-job analysis. Run match analysis on more jobs first." },
        { status: 400 }
      );
    }

    // For unfiltered queries, check the shared gaps cache
    if (isUnfiltered) {
      const profile = await prisma.profile.findFirst({ select: { id: true } });
      if (profile) {
        const gapsFp = computeGapsFingerprint(jobs.map((j) => ({ id: j.id, matchedAt: j.matchedAt })));
        const cached = await getCachedGaps(profile.id, gapsFp);
        if (cached) {
          console.log("[gaps] Cache hit — returning cached gap aggregation");
          return NextResponse.json(cached);
        }

        const result = await aggregateGaps(jobMatchData, {});
        await setCachedGaps(profile.id, result, gapsFp);
        return NextResponse.json(result);
      }
    }

    const result = await aggregateGaps(jobMatchData, {});
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gap aggregation error:", error);
    return NextResponse.json(
      { error: "Failed to aggregate gaps" },
      { status: 500 }
    );
  }
}
