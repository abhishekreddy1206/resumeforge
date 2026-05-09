import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  try {
    const { jobId, rejected } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (typeof rejected !== "boolean") {
      return NextResponse.json({ error: "rejected must be a boolean" }, { status: 400 });
    }

    if (rejected) {
      const existing = await prisma.job.findUnique({
        where: { id: jobId },
        select: { applied: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      if (!existing.applied) {
        return NextResponse.json(
          { error: "Cannot mark a job rejected before it was applied" },
          { status: 400 },
        );
      }
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        rejected,
        rejectedAt: rejected ? new Date() : null,
      },
      select: { id: true, rejected: true, rejectedAt: true },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("Job rejected toggle error:", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
