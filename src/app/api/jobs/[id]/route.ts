import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      resumes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, format: true, createdAt: true },
      },
      profileVersions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          score: true,
          scoreVersion: true,
          delta: true,
          createdAt: true,
          resumes: {
            orderBy: { createdAt: "desc" },
            select: { id: true, format: true, createdAt: true },
          },
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
