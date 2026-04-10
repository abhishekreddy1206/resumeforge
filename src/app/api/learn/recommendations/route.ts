import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aggregateGaps, recommendGuides } from "@/lib/claude";

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
    const jobs = await prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: { title: true, company: true, matchResult: true, terminologyMap: true },
    });

    if (jobs.length < 2) {
      return NextResponse.json([]);
    }

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
      return NextResponse.json([]);
    }

    const gapResult = await aggregateGaps(jobMatchData, {});

    const existingGuides = await prisma.guide.findMany({
      select: { topic: true },
    });
    const existingTopics = existingGuides.map((g) => g.topic);

    const recommendations = await recommendGuides(
      gapResult.aggregatedGaps,
      gapResult.leverageScores,
      existingTopics,
    );

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
