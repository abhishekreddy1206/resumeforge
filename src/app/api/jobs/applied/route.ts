import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  try {
    const { jobId, applied } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (typeof applied !== "boolean") {
      return NextResponse.json({ error: "applied must be a boolean" }, { status: 400 });
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        applied,
        appliedAt: applied ? new Date() : null,
        ...(applied ? {} : { callbackReceived: false, callbackAt: null }),
      },
      select: {
        id: true,
        applied: true,
        appliedAt: true,
        callbackReceived: true,
        callbackAt: true,
      },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("Job applied toggle error:", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
