import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchProfileToJob } from "@/lib/claude";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { jobId, temporaryProfile } = await request.json();

    if (!jobId || !temporaryProfile) {
      return NextResponse.json(
        { error: "jobId and temporaryProfile are required" },
        { status: 400 }
      );
    }

    if (typeof temporaryProfile !== "object" || !temporaryProfile.name) {
      return NextResponse.json(
        { error: "Invalid temporaryProfile shape" },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Use the cached original match score as the baseline.
    // This matches what the UI shows as "Original", so the delta is visually consistent.
    const cachedMatch = safeJsonParse(job.matchResult) as Record<string, unknown> | null;
    if (!cachedMatch || typeof cachedMatch.overallScore !== "number") {
      return NextResponse.json(
        { error: "No match analysis found — run Match Analysis first" },
        { status: 400 }
      );
    }

    const originalScore = cachedMatch.overallScore as number;

    const jobAnalysis = {
      title: job.title,
      company: job.company,
      skills: safeJsonParse(job.skills, []),
      requirements: safeJsonParse(job.requirements, []),
      atsKeywords: safeJsonParse(job.atsKeywords, {}),
      seniority: job.seniority,
    };

    const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{jdTerm: string; resumeSynonyms: string[]}>;

    // Only score the temporary profile — one Claude call instead of two.
    const newMatch = await matchProfileToJob(temporaryProfile, jobAnalysis, terminologyMap, { model: job.aiModel });
    const newScore = newMatch.overallScore;

    return NextResponse.json({
      originalScore,
      newScore,
      delta: newScore - originalScore,
      match: newMatch,
    });
  } catch (error) {
    console.error("Rescore error:", error);
    return NextResponse.json(
      { error: "Failed to rescore profile" },
      { status: 500 }
    );
  }
}
