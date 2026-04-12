import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuideSection } from "@/lib/claude";
import type { GuideContent } from "@/lib/claude";

const SECTION_BATCH_SIZE = 2;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({ where: { id } });
    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    // Already done — nothing to resume
    if (guide.status === "published") {
      return NextResponse.json({ status: "published", remaining: 0 });
    }

    const content = JSON.parse(guide.content) as GuideContent;
    const emptySections = content.sections.filter((s) => s.explanation.length === 0);

    if (emptySections.length === 0) {
      // All sections present — just publish
      await prisma.guide.update({
        where: { id },
        data: { status: "published" },
      });
      return NextResponse.json({ status: "published", remaining: 0 });
    }

    // Mark as generating
    await prisma.guide.update({
      where: { id },
      data: { status: "generating" },
    });

    // Generate ONE batch synchronously (no after() — work is done in the request)
    const batch = emptySections.slice(0, SECTION_BATCH_SIZE);
    const siblingTitles = content.sections.map((s) => s.title);

    console.log(`[guide-resume] Generating batch of ${batch.length} sections for guide ${id}: ${batch.map((s) => s.title).join(", ")}`);

    const results = await Promise.allSettled(
      batch.map((sp) =>
        generateGuideSection(
          guide.topic,
          { id: sp.id, title: sp.title, scope: "" },
          { difficulty: content.difficulty, siblingTitles }
        )
      )
    );

    // Re-read guide to merge results (avoid overwriting concurrent updates)
    const currentGuide = await prisma.guide.findUnique({ where: { id } });
    if (!currentGuide) {
      return NextResponse.json({ error: "Guide disappeared" }, { status: 404 });
    }

    const currentContent = JSON.parse(currentGuide.content) as GuideContent;
    let completedCount = 0;
    let failedCount = 0;

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        const idx = currentContent.sections.findIndex((s) => s.id === batch[j].id);
        if (idx !== -1) {
          currentContent.sections[idx] = result.value;
        }
        completedCount++;
      } else {
        console.error(`[guide-resume] Section "${batch[j].title}" failed:`, result.reason);
        failedCount++;
      }
    }

    const remainingAfter = currentContent.sections.filter((s) => s.explanation.length === 0).length;
    const newStatus = remainingAfter === 0
      ? "published"
      : completedCount > 0
        ? "generating"
        : "failed";

    await prisma.guide.update({
      where: { id },
      data: { content: JSON.stringify(currentContent), status: newStatus },
    });

    console.log(`[guide-resume] Guide ${id}: batch done (${completedCount} ok, ${failedCount} failed, ${remainingAfter} remaining) -> ${newStatus}`);

    return NextResponse.json({
      status: newStatus,
      remaining: remainingAfter,
      generated: completedCount,
    });
  } catch (error) {
    console.error("Guide resume error:", error);
    return NextResponse.json({ error: "Failed to resume guide generation" }, { status: 500 });
  }
}
