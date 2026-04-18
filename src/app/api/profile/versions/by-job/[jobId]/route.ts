import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function safeParse<T>(raw: string | null | undefined): {
  value: T | null;
  parseError: boolean;
} {
  if (raw == null) return { value: null, parseError: false };
  try {
    return { value: JSON.parse(raw) as T, parseError: false };
  } catch {
    return { value: null, parseError: true };
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, company: true, url: true, applied: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const rawVersions = await prisma.profileVersion.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      include: {
        resumes: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            format: true,
            createdAt: true,
            evaluationStatus: true,
            evaluationVersion: true,
          },
        },
      },
    });

    const versions = rawVersions.map((v) => {
      const snapshot = safeParse<Record<string, unknown>>(v.snapshot);
      const optimizationPlan = safeParse<Record<string, unknown>>(v.optimizationPlan);
      const resumeData = safeParse<Record<string, unknown>>(v.resumeData);
      return {
        id: v.id,
        score: v.score,
        scoreVersion: v.scoreVersion,
        delta: v.delta,
        label: v.label,
        createdAt: v.createdAt,
        snapshot: snapshot.value,
        optimizationPlan: optimizationPlan.value,
        resumeData: resumeData.value,
        parseError:
          snapshot.parseError || optimizationPlan.parseError || resumeData.parseError,
        resumes: v.resumes,
      };
    });

    return NextResponse.json({ job, versions });
  } catch (error) {
    console.error("Get versions by job error:", error);
    return NextResponse.json(
      { error: "Failed to load versions for job" },
      { status: 500 }
    );
  }
}
