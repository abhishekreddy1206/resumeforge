import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { before, dryRun } = await request.json();

    if (!before || typeof before !== "string") {
      return NextResponse.json(
        { error: "before is required (ISO date string, e.g. '2026-04-15')" },
        { status: 400 },
      );
    }

    const cutoff = new Date(before);
    if (Number.isNaN(cutoff.getTime())) {
      return NextResponse.json(
        { error: `before is not a valid date: ${before}` },
        { status: 400 },
      );
    }

    const where = {
      applied: false,
      archived: false,
      createdAt: { lt: cutoff },
    } as const;

    if (dryRun === true) {
      const count = await prisma.job.count({ where });
      return NextResponse.json({
        dryRun: true,
        wouldArchive: count,
        before: cutoff.toISOString(),
      });
    }

    const result = await prisma.job.updateMany({
      where,
      data: { archived: true, archivedAt: new Date() },
    });

    return NextResponse.json({
      archived: result.count,
      before: cutoff.toISOString(),
    });
  } catch (error) {
    console.error("Bulk archive-stale error:", error);
    return NextResponse.json(
      { error: "Failed to archive stale jobs" },
      { status: 500 },
    );
  }
}
