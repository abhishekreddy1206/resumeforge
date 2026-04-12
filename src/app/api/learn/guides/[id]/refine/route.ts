import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refineGuide, refineGuideSection, classifySectionRelevance } from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";
import { resolveGuideSources } from "@/lib/learn-sources";

const REFINE_BATCH_SIZE = 2;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({
      where: { id },
      include: { sources: true },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const body = await request.json();
    const { sources, instructions, model } = body as {
      sources: Array<{ type: string; content?: string; url?: string; filename?: string; savedSourceId?: string }>;
      instructions?: string;
      model?: string;
    };

    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return NextResponse.json({ error: "At least one source is required" }, { status: 400 });
    }

    const { sourceTexts: newSourceTexts, sourcesToSave } = await resolveGuideSources(guide.profileId, sources);
    if (newSourceTexts.length === 0) {
      return NextResponse.json({ error: "No usable source content was provided" }, { status: 400 });
    }

    const existingContent = JSON.parse(guide.content) as GuideContentStorage;

    // Smart source routing: classify which sections benefit from new sources
    const sectionPlan = existingContent._sectionPlan || existingContent.sections.map((s) => ({
      id: s.id,
      title: s.title,
      scope: s.explanation.slice(0, 200),
    }));

    const relevance = await classifySectionRelevance(sectionPlan, newSourceTexts, { model });
    const relevantSectionIds = relevance.filter((r) => r.relevant).map((r) => r.sectionId);

    console.log(`[guide-refine] Classified ${relevantSectionIds.length}/${sectionPlan.length} sections as relevant`);

    // If all sections are relevant or user wants full restructure, fall back to full refine
    const shouldFullRefine = relevantSectionIds.length === sectionPlan.length ||
      (instructions && instructions.toLowerCase().includes("restructure"));

    if (relevantSectionIds.length === 0 && !shouldFullRefine) {
      return NextResponse.json({
        status: "noop",
        relevantSections: [],
        totalSections: sectionPlan.length,
        mode: "none",
        message: "No guide sections matched the new source closely enough to refine.",
      });
    }

    // Initialize _sectionStatuses if missing (guides created before this feature)
    if (!existingContent._sectionStatuses) {
      existingContent._sectionStatuses = {};
      for (const s of existingContent.sections) {
        existingContent._sectionStatuses[s.id] = "completed";
      }
    }

    // Mark relevant sections as "refining"
    if (!shouldFullRefine) {
      for (const sId of relevantSectionIds) {
        existingContent._sectionStatuses[sId] = "refining";
      }
    }

    // Save sources and update guide status in one transaction
    await prisma.$transaction(async (tx) => {
      for (const src of sourcesToSave) {
        await tx.guideSource.create({
          data: {
            guideId: guide.id,
            type: src.type,
            url: src.url || null,
            title: src.title || null,
            content: src.content,
          },
        });
      }

      await tx.guide.update({
        where: { id: guide.id },
        data: {
          content: JSON.stringify(existingContent),
          status: "generating",
          lastAsyncError: null,
          lastAsyncStage: null,
        },
      });
    });

    // Run actual refinement in the background via after()
    after(async () => {
      try {
        // Re-load guide sources for full source list
        const allSources = await prisma.guideSource.findMany({ where: { guideId: guide.id } });
        const allSourceTexts = allSources.map((s) => s.content);

        const currentGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
        if (!currentGuide) return;
        const currentContent = JSON.parse(currentGuide.content) as GuideContentStorage;

        // Initialize _sectionStatuses if missing (guides created before this feature)
        if (!currentContent._sectionStatuses) {
          currentContent._sectionStatuses = {};
          for (const s of currentContent.sections) {
            currentContent._sectionStatuses[s.id] = "completed";
          }
        }

        let resultContent: GuideContentStorage;
        let changeDescription: string;
        const refinedSections: string[] = [];
        let failedSections = 0;

        if (shouldFullRefine) {
          console.log(`[guide-refine] Full refine for guide ${id}`);
          const result = await refineGuide(currentContent, newSourceTexts, { instructions, model });
          resultContent = {
            ...result.content,
            _sectionPlan: currentContent._sectionPlan,
            _sectionStatuses: currentContent._sectionStatuses,
          };
          changeDescription = result.changeDescription;
          if (resultContent._sectionStatuses) {
            for (const s of resultContent.sections) {
              resultContent._sectionStatuses[s.id] = "completed";
            }
          }
        } else {
          // Per-section refine in batches
          const siblingTitles = currentContent.sections.map((s) => s.title);
          resultContent = { ...currentContent };

          for (let i = 0; i < relevantSectionIds.length; i += REFINE_BATCH_SIZE) {
            const batch = relevantSectionIds.slice(i, i + REFINE_BATCH_SIZE);
            console.log(`[guide-refine] Refining batch: ${batch.join(", ")}`);

            const results = await Promise.allSettled(
              batch.map((sectionId) => {
                const section = currentContent.sections.find((s) => s.id === sectionId);
                if (!section) return Promise.reject(new Error(`Section ${sectionId} not found`));
                return refineGuideSection(
                  guide.topic,
                  section,
                  allSourceTexts,
                  { difficulty: currentContent.difficulty, siblingTitles },
                  { instructions, model }
                );
              })
            );

            // Merge batch results into DB immediately (so polling picks them up)
            const latestGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
            if (!latestGuide) return;
            const latestContent = JSON.parse(latestGuide.content) as GuideContentStorage;

            for (let j = 0; j < results.length; j++) {
              const result = results[j];
              const sectionId = batch[j];
              if (result.status === "fulfilled") {
                const idx = latestContent.sections.findIndex((s) => s.id === sectionId);
                if (idx !== -1) latestContent.sections[idx] = result.value;
                if (latestContent._sectionStatuses) latestContent._sectionStatuses[sectionId] = "completed";
                refinedSections.push(sectionId);
              } else {
                console.error(`[guide-refine] Section "${sectionId}" failed:`, result.reason);
                if (latestContent._sectionStatuses) latestContent._sectionStatuses[sectionId] = "completed"; // restore original
                failedSections++;
              }
            }

            await prisma.guide.update({
              where: { id: guide.id },
              data: { content: JSON.stringify(latestContent) },
            });
          }

          const reasons = relevance.filter((r) => r.relevant).map((r) => `${r.sectionId}: ${r.reason}`);
          changeDescription = `Refined ${refinedSections.length} sections: ${reasons.join("; ")}`;

          // Re-read final state for version snapshot
          const finalGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
          if (finalGuide) {
            resultContent = JSON.parse(finalGuide.content) as GuideContentStorage;
          }
        }

        // Save version history and mark as published
        const newVersion = guide.version + 1;
        await prisma.$transaction(async (tx) => {
          await tx.guideVersion.create({
            data: {
              guideId: guide.id,
              version: guide.version,
              content: guide.content,
              changeDescription,
            },
          });

          await tx.guide.update({
            where: { id: guide.id },
            data: {
              content: JSON.stringify(resultContent),
              version: newVersion,
              status: "published",
              lastAsyncError: failedSections > 0
                ? `${failedSections} section${failedSections === 1 ? "" : "s"} could not be refined. Existing content was preserved.`
                : null,
              lastAsyncStage: failedSections > 0 ? "refine_sections" : null,
            },
          });
        });

        console.log(`[guide-refine] Done: ${refinedSections.length} sections refined -> v${newVersion}`);
      } catch (err) {
        console.error("[guide-refine] Background refine failed:", err);
        await prisma.guide.update({
          where: { id: guide.id },
          data: {
            status: "published",
            lastAsyncError: err instanceof Error ? err.message.slice(0, 500) : "Guide refinement failed",
            lastAsyncStage: "refine_sections",
          }, // restore — don't leave in "generating" state
        }).catch(() => {});
      }
    });

    // Return immediately with classification results — refinement happens in background
    return NextResponse.json({
      status: "generating",
      relevantSections: relevantSectionIds,
      totalSections: sectionPlan.length,
      mode: shouldFullRefine ? "full" : "per-section",
    });
  } catch (error) {
    console.error("Guide refine error:", error);
    return NextResponse.json({ error: "Failed to refine guide" }, { status: 500 });
  }
}
