import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildJobAnalysisFromRecord, buildResumeQualityVersion } from "@/lib/resume-quality";
import { safeJsonParse } from "@/lib/utils/json";
import { serializeProfile } from "@/lib/utils/profile-diff";

export async function POST(request: NextRequest) {
  try {
    const { jobId, temporaryProfile } = await request.json();

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
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

    const matchResult = safeJsonParse<Record<string, unknown> | null>(job.matchResult, null);
    if (!matchResult || typeof matchResult.overallScore !== "number") {
      return NextResponse.json(
        { error: "No match analysis found — run Match Analysis first" },
        { status: 400 }
      );
    }

    const profileData =
      temporaryProfile && typeof temporaryProfile === "object" && temporaryProfile !== null
        ? temporaryProfile
        : serializeProfile(profile);

    const build = await buildResumeQualityVersion({
      profile: profileData,
      jobAnalysis: buildJobAnalysisFromRecord(job as unknown as Record<string, unknown>),
      matchResult,
      model: job.aiModel,
    });

    return NextResponse.json({
      optimizationPlan: build.optimizationPlan,
      previewResume: build.resumeData,
      qualityPreview: build.evaluation,
      warnings: build.warnings,
      hardBlockers: build.hardBlockers,
      blockedStage: build.blockedStage,
    });
  } catch (error) {
    console.error("Optimize preview error:", error);
    return NextResponse.json(
      { error: "Failed to optimize resume preview" },
      { status: 500 }
    );
  }
}
