import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refineGuideSection } from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const guide = await prisma.guide.findUnique({
      where: { id },
      include: { sources: true },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const content = JSON.parse(guide.content) as GuideContentStorage;
    const section = content.sections.find((s) => s.id === sectionId);

    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    const statuses = content._sectionStatuses || {};
    if (statuses[sectionId] && statuses[sectionId] !== "completed") {
      return NextResponse.json(
        { error: `Section is currently ${statuses[sectionId]}` },
        { status: 409 }
      );
    }

    const body = await request.json();
    const { instructions, model } = body as { instructions?: string; model?: string };

    // Mark section as refining
    statuses[sectionId] = "refining";
    content._sectionStatuses = statuses;
    await prisma.guide.update({
      where: { id },
      data: {
        content: JSON.stringify(content),
        lastAsyncError: null,
        lastAsyncStage: null,
      },
    });

    // Load all guide sources
    const sourceTexts = guide.sources.map((s) => s.content);
    const siblingTitles = content.sections.map((s) => s.title);

    try {
      const refined = await refineGuideSection(
        guide.topic,
        section,
        sourceTexts,
        { difficulty: content.difficulty, siblingTitles },
        { instructions, model }
      );

      // Re-read to merge (avoid overwriting concurrent changes)
      const currentGuide = await prisma.guide.findUnique({ where: { id } });
      if (!currentGuide) {
        return NextResponse.json({ error: "Guide disappeared" }, { status: 404 });
      }

      const currentContent = JSON.parse(currentGuide.content) as GuideContentStorage;
      const idx = currentContent.sections.findIndex((s) => s.id === sectionId);
      if (idx !== -1) currentContent.sections[idx] = refined;
      if (currentContent._sectionStatuses) currentContent._sectionStatuses[sectionId] = "completed";

      const newVersion = guide.version + 1;
      await prisma.$transaction(async (tx) => {
        await tx.guideVersion.create({
          data: {
            guideId: guide.id,
            version: guide.version,
            content: guide.content,
            changeDescription: `Refined section: ${section.title}${instructions ? ` (${instructions.slice(0, 100)})` : ""}`,
          },
        });

        await tx.guide.update({
          where: { id },
          data: {
            content: JSON.stringify(currentContent),
            version: newVersion,
            lastAsyncError: null,
            lastAsyncStage: null,
          },
        });
      });

      return NextResponse.json({ section: refined, version: newVersion });
    } catch (err) {
      // Restore status on failure
      const fallback = await prisma.guide.findUnique({ where: { id } });
      if (fallback) {
        const fallbackContent = JSON.parse(fallback.content) as GuideContentStorage;
        if (fallbackContent._sectionStatuses) fallbackContent._sectionStatuses[sectionId] = "completed";
        await prisma.guide.update({
          where: { id },
          data: {
            content: JSON.stringify(fallbackContent),
            lastAsyncError: "Section refinement failed",
            lastAsyncStage: "refine_section",
          },
        });
      }
      console.error(`[section-refine] Failed for section "${sectionId}":`, err);
      return NextResponse.json({ error: "Section refine failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("Section refine error:", error);
    return NextResponse.json({ error: "Failed to refine section" }, { status: 500 });
  }
}
