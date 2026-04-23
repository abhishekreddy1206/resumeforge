import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  try {
    const { jobId, callbackReceived } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (typeof callbackReceived !== "boolean") {
      return NextResponse.json({ error: "callbackReceived must be a boolean" }, { status: 400 });
    }

    if (callbackReceived) {
      const existing = await prisma.job.findUnique({
        where: { id: jobId },
        select: { applied: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      if (!existing.applied) {
        return NextResponse.json(
          { error: "Cannot record callback on a job that wasn't applied" },
          { status: 400 },
        );
      }
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        callbackReceived,
        callbackAt: callbackReceived ? new Date() : null,
      },
      select: { id: true, callbackReceived: true, callbackAt: true },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("Job callback toggle error:", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
