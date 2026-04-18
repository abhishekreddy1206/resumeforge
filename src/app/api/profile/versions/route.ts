import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RESUME_QUALITY_SCORE_VERSION } from "@/lib/resume-quality";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pageRaw = Number(url.searchParams.get("page") ?? "1");
    const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "10");
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1
        ? Math.min(50, Math.floor(pageSizeRaw))
        : 10;

    // Step 1: find all jobs that have at least one ProfileVersion and order
    // them by most-recent version activity. We do this as a small query
    // (id + createdAt of newest version) then slice for pagination.
    const jobsWithVersions = await prisma.job.findMany({
      where: { profileVersions: { some: {} } },
      select: {
        id: true,
        profileVersions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const ordered = jobsWithVersions
      .map((j) => ({
        id: j.id,
        lastActivityAt: j.profileVersions[0]?.createdAt ?? new Date(0),
      }))
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

    const total = ordered.length;
    const start = (page - 1) * pageSize;
    const pageIds = ordered.slice(start, start + pageSize).map((j) => j.id);

    // Step 2: fetch details only for the page slice.
    const [pageJobs, unlinkedResumes] = await Promise.all([
      pageIds.length === 0
        ? Promise.resolve([])
        : prisma.job.findMany({
            where: { id: { in: pageIds } },
            select: {
              id: true,
              title: true,
              company: true,
              applied: true,
              appliedAt: true,
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
                select: { id: true, format: true, profileVersionId: true },
              },
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
    ]);

    const pageById = new Map(pageJobs.map((j) => [j.id, j]));
    const items = pageIds
      .map((id) => pageById.get(id))
      .filter((j): j is NonNullable<typeof j> => Boolean(j))
      .map((job) => {
        const versions = job.profileVersions;
        const latest = versions[0];
        const scoreTrend = versions
          .slice(0, 5)
          .map((v) => v.score)
          .reverse(); // oldest → newest for trend rendering
        return {
          id: job.id,
          title: job.title,
          company: job.company,
          applied: job.applied,
          appliedAt: job.appliedAt,
          latestScore: latest?.score ?? null,
          latestDelta: latest?.delta ?? null,
          latestScoreVersion: latest?.scoreVersion ?? null,
          latestVersionId: latest?.id ?? null,
          scoreTrend,
          versionCount: versions.length,
          pdfCount: job.resumes.filter((r) => r.format === "pdf").length,
          docxCount: job.resumes.filter((r) => r.format === "docx").length,
          lastActivityAt: latest?.createdAt ?? null,
        };
      });

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      unlinkedResumes,
    });
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

    // Idempotency: if the most recent version for this job has an identical snapshot, return it
    const existingVersion = await prisma.profileVersion.findFirst({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, title: true, company: true } },
      },
    });

    if (existingVersion && existingVersion.snapshot === snapshotStr) {
      return NextResponse.json(existingVersion);
    }

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
