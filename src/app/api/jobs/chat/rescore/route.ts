import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  RESUME_QUALITY_SCORE_VERSION,
  buildJobAnalysisFromRecord,
  buildResumeQualityVersion,
} from "@/lib/resume-quality";
import { safeJsonParse } from "@/lib/utils/json";
import { serializeProfile } from "@/lib/utils/profile-diff";

export async function POST(request: NextRequest) {
  try {
    const { jobId, temporaryProfile } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const [job, profile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
      prisma.profile.findFirst({
        include: {
          experiences: true,
          educations: true,
          projects: true,
          skills: true,
          publications: true,
          certifications: true,
        },
      }),
    ]);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const cachedMatch = safeJsonParse<Record<string, unknown> | null>(job.matchResult, null);
    if (!cachedMatch || typeof cachedMatch.overallScore !== "number") {
      return NextResponse.json(
        { error: "No match analysis found — run Match Analysis first" },
        { status: 400 }
      );
    }

    const build = await buildResumeQualityVersion({
      profile:
        temporaryProfile && typeof temporaryProfile === "object" && temporaryProfile !== null
          ? temporaryProfile
          : serializeProfile(profile),
      jobAnalysis: buildJobAnalysisFromRecord(job as unknown as Record<string, unknown>),
      matchResult: cachedMatch,
      model: job.aiModel,
    });

    const latestV2Version = await prisma.profileVersion.findFirst({
      where: {
        jobId,
        scoreVersion: RESUME_QUALITY_SCORE_VERSION,
      },
      orderBy: { createdAt: "desc" },
      select: { score: true },
    });

    const qualityScore = build.evaluation?.overallScore ?? 0;
    const baselineQuality = latestV2Version?.score ?? qualityScore;

    return NextResponse.json({
      originalScore: baselineQuality,
      newScore: qualityScore,
      delta: latestV2Version ? qualityScore - baselineQuality : 0,
      matchScore: cachedMatch.overallScore,
      match: cachedMatch,
      optimizationPlan: build.optimizationPlan,
      previewResume: build.resumeData,
      qualityPreview: build.evaluation,
      warnings: build.warnings,
      hardBlockers: build.hardBlockers,
      blockedStage: build.blockedStage,
    });
  } catch (error) {
    console.error("Rescore alias error:", error);
    return NextResponse.json(
      { error: "Failed to generate optimization preview" },
      { status: 500 }
    );
  }
}
