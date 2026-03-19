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

    const jobAnalysis = {
      title: job.title,
      company: job.company,
      skills: safeJsonParse(job.skills, []),
      requirements: safeJsonParse(job.requirements, []),
      atsKeywords: safeJsonParse(job.atsKeywords, {}),
      seniority: job.seniority,
    };

    // Get the original cached score for comparison
    const originalMatch = safeJsonParse(job.matchResult) as Record<
      string,
      unknown
    > | null;
    const originalScore =
      typeof originalMatch?.overallScore === "number"
        ? originalMatch.overallScore
        : null;

    // Re-score with the temporary profile (NOT cached to DB)
    const newMatch = await matchProfileToJob(temporaryProfile, jobAnalysis);

    return NextResponse.json({
      originalScore,
      newScore: newMatch.overallScore,
      delta: originalScore !== null ? newMatch.overallScore - originalScore : null,
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
