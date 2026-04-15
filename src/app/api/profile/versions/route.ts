import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RESUME_QUALITY_SCORE_VERSION } from "@/lib/resume-quality";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET() {
  try {
    const [versions, unlinkedResumes, jobs] = await Promise.all([
      prisma.profileVersion.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          job: { select: { id: true, title: true, company: true } },
          resumes: { select: { id: true, format: true, createdAt: true } },
        },
      }),
      prisma.resume.findMany({
        where: { profileVersionId: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          format: true,
          createdAt: true,
          evaluationStatus: true,
          evaluationVersion: true,
          job: { select: { id: true, title: true, company: true } },
        },
      }),
      prisma.job.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          company: true,
          matchResult: true,
          matchedAt: true,
          createdAt: true,
          profileVersions: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              score: true,
              scoreVersion: true,
              delta: true,
              createdAt: true,
            },
          },
          resumes: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              format: true,
              profileVersionId: true,
              evaluationStatus: true,
              evaluationVersion: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({ versions, unlinkedResumes, jobs });
  } catch (error) {
    console.error("List versions error:", error);
    return NextResponse.json(
      { error: "Failed to list profile versions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      profileSnapshot,
      snapshot,
      optimizationPlan,
      resumeData,
      jobId,
      score,
      scoreVersion,
      delta,
      label,
    } = body;

    const resolvedSnapshot = snapshot ?? profileSnapshot;

    if (!resolvedSnapshot || !jobId || typeof score !== "number") {
      return NextResponse.json(
        { error: "snapshot/profileSnapshot, jobId, and score are required" },
        { status: 400 }
      );
    }

    if (!isObjectRecord(resolvedSnapshot) || !resolvedSnapshot.name) {
      return NextResponse.json(
        { error: "Invalid snapshot shape" },
        { status: 400 }
      );
    }

    if (optimizationPlan && !isObjectRecord(optimizationPlan)) {
      return NextResponse.json(
        { error: "Invalid optimizationPlan shape" },
        { status: 400 }
      );
    }

    if (resumeData && !isObjectRecord(resumeData)) {
      return NextResponse.json(
        { error: "Invalid resumeData shape" },
        { status: 400 }
      );
    }

    const snapshotStr = JSON.stringify(resolvedSnapshot);
    const optimizationPlanStr = optimizationPlan ? JSON.stringify(optimizationPlan) : null;
    const resumeDataStr = resumeData ? JSON.stringify(resumeData) : null;

    if (snapshotStr.length > 512_000) {
      return NextResponse.json(
        { error: "Profile snapshot too large" },
        { status: 400 }
      );
    }

    const [profile, job] = await Promise.all([
      prisma.profile.findFirst(),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found" },
        { status: 404 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const resolvedScoreVersion = Number.isInteger(scoreVersion)
      ? scoreVersion
      : optimizationPlanStr || resumeDataStr
        ? RESUME_QUALITY_SCORE_VERSION
        : 1;

    const version = await prisma.profileVersion.create({
      data: {
        profileId: profile.id,
        jobId,
        snapshot: snapshotStr,
        optimizationPlan: optimizationPlanStr,
        resumeData: resumeDataStr,
        score,
        scoreVersion: resolvedScoreVersion,
        delta: typeof delta === "number" ? delta : null,
        label:
          label ||
          `${job.title} at ${job.company} — ${score}%`,
      },
      include: {
        job: { select: { id: true, title: true, company: true } },
      },
    });

    return NextResponse.json(version);
  } catch (error) {
    console.error("Save version error:", error);
    return NextResponse.json(
      { error: "Failed to save profile version" },
      { status: 500 }
    );
  }
}
