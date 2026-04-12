import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuideSection } from "@/lib/claude";
import type { GuideContent } from "@/lib/claude";

interface SectionPlanEntry {
  id: string;
  title: string;
  scope: string;
}

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

    const content = JSON.parse(guide.content) as GuideContent & { _sectionPlan?: SectionPlanEntry[] };
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

    // Generate ONE section synchronously (no concurrency — avoids CLI subscription limits)
    const section = emptySections[0];
    const siblingTitles = content.sections.map((s) => s.title);

    // Recover original scope from stored _sectionPlan if available
    const planEntry = content._sectionPlan?.find((sp) => sp.id === section.id);
    const scope = planEntry?.scope || "";

    console.log(`[guide-resume] Generating section "${section.title}" for guide ${id} (${emptySections.length} remaining)`);

    let generated: Awaited<ReturnType<typeof generateGuideSection>> | null = null;
    try {
      generated = await generateGuideSection(
        guide.topic,
        { id: section.id, title: section.title, scope },
        { difficulty: content.difficulty, siblingTitles }
      );
    } catch (err) {
      console.error(`[guide-resume] Section "${section.title}" failed:`, err);
    }

    // Re-read guide to merge result (avoid overwriting concurrent updates)
    const currentGuide = await prisma.guide.findUnique({ where: { id } });
    if (!currentGuide) {
      return NextResponse.json({ error: "Guide disappeared" }, { status: 404 });
    }

    const currentContent = JSON.parse(currentGuide.content) as GuideContent;

    if (generated) {
      const idx = currentContent.sections.findIndex((s) => s.id === section.id);
      if (idx !== -1) {
        currentContent.sections[idx] = generated;
      }
    }

    const remainingAfter = currentContent.sections.filter((s) => s.explanation.length === 0).length;
    const newStatus = remainingAfter === 0
      ? "published"
      : generated
        ? "generating"
        : "failed";

    await prisma.guide.update({
      where: { id },
      data: { content: JSON.stringify(currentContent), status: newStatus },
    });

    console.log(`[guide-resume] Guide ${id}: "${section.title}" ${generated ? "ok" : "failed"} (${remainingAfter} remaining) -> ${newStatus}`);

    return NextResponse.json({
      status: newStatus,
      remaining: remainingAfter,
      generated: generated ? 1 : 0,
    });
  } catch (error) {
    console.error("Guide resume error:", error);
    return NextResponse.json({ error: "Failed to resume guide generation" }, { status: 500 });
  }
}
