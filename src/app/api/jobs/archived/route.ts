import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  try {
    const { jobId, archived } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (typeof archived !== "boolean") {
      return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        archived,
        archivedAt: archived ? new Date() : null,
      },
      select: { id: true, archived: true, archivedAt: true },
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("Job archived toggle error:", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
