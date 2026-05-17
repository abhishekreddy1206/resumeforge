import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeRejectionUpdate } from "@/lib/job-rejection";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, rejected, reason } = body as {
      jobId?: unknown;
      rejected?: unknown;
      reason?: unknown;
    };

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (typeof rejected !== "boolean") {
      return NextResponse.json({ error: "rejected must be a boolean" }, { status: 400 });
    }

    const existing = await prisma.job.findUnique({
      where: { id: jobId },
      select: { applied: true, rejected: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (rejected && !existing.applied) {
      return NextResponse.json(
        { error: "Cannot mark a job rejected before it was applied" },
        { status: 400 },
      );
    }

    const decision = computeRejectionUpdate({
      rejected,
      reason,
      currentlyRejected: existing.rejected,
    });
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error }, { status: decision.status });
    }

    const updateData =
      decision.data.rejected
        ? {
            rejected: true as const,
            rejectionReason: decision.data.reason,
            ...(decision.data.preserveTimestamp ? {} : { rejectedAt: new Date() }),
          }
        : {
            rejected: false as const,
            rejectedAt: null,
            rejectionReason: null,
          };

    const job = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
      select: { id: true, rejected: true, rejectedAt: true, rejectionReason: true },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("Job rejected toggle error:", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
