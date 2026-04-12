import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuideSection } from "@/lib/claude";
import type { GuideSection, GuideContent } from "@/lib/claude";

const SECTION_BATCH_SIZE = 3;

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

    // Don't resume if already generating (avoid race condition)
    if (guide.status === "generating") {
      return NextResponse.json({ error: "Guide is already generating" }, { status: 409 });
    }

    const content = JSON.parse(guide.content) as GuideContent;
    const emptySections = content.sections.filter((s) => s.explanation.length === 0);

    if (emptySections.length === 0) {
      // All sections present — just publish
      if (guide.status !== "published") {
        await prisma.guide.update({
          where: { id },
          data: { status: "published" },
        });
      }
      return NextResponse.json({ status: "published", remaining: 0 });
    }

    // Mark as generating so frontend polls
    await prisma.guide.update({
      where: { id },
      data: { status: "generating" },
    });

    after(async () => {
      try {
        const siblingTitles = content.sections.map((s) => s.title);
        let completedCount = 0;
        let failedCount = 0;

        const sectionPlan = emptySections.map((s) => ({
          id: s.id,
          title: s.title,
          scope: "",
        }));

        for (let i = 0; i < sectionPlan.length; i += SECTION_BATCH_SIZE) {
          const batch = sectionPlan.slice(i, i + SECTION_BATCH_SIZE);

          const results = await Promise.allSettled(
            batch.map((sp) =>
              generateGuideSection(guide.topic, sp, { difficulty: content.difficulty, siblingTitles })
            )
          );

          const completedSections: Array<{ id: string; section: GuideSection }> = [];
          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            if (result.status === "fulfilled") {
              completedSections.push({ id: batch[j].id, section: result.value });
              completedCount++;
            } else {
              console.error(`[guide-resume] Section "${batch[j].title}" failed:`, result.reason);
              failedCount++;
            }
          }

          if (completedSections.length > 0) {
            const current = await prisma.guide.findUnique({ where: { id } });
            if (current) {
              const currentContent = JSON.parse(current.content) as GuideContent;
              for (const { id: sectionId, section } of completedSections) {
                const idx = currentContent.sections.findIndex((s) => s.id === sectionId);
                if (idx !== -1) {
                  currentContent.sections[idx] = section;
                }
              }
              await prisma.guide.update({
                where: { id },
                data: { content: JSON.stringify(currentContent) },
              });
            }
          }
        }

        const finalStatus = completedCount === 0 ? "failed" : "published";
        await prisma.guide.update({
          where: { id },
          data: { status: finalStatus },
        });

        console.log(`[guide-resume] Guide ${id} resumed: ${completedCount} sections, ${failedCount} failed → ${finalStatus}`);
      } catch (err) {
        console.error("[guide-resume] Background generation crashed:", err);
        await prisma.guide.update({
          where: { id },
          data: { status: "failed" },
        }).catch(() => {});
      }
    });

    return NextResponse.json({ status: "resuming", remaining: emptySections.length });
  } catch (error) {
    console.error("Guide resume error:", error);
    return NextResponse.json({ error: "Failed to resume guide generation" }, { status: 500 });
  }
}
