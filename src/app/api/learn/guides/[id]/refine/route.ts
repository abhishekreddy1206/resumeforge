import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refineGuide, refineGuideSection, classifySectionRelevance } from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";
import { GuideSourceResolutionError, type GuideSourcePayload, getActiveGuideSourceTexts, getGuideVersionSourceRefs, persistGuideSources, resolveGuideSources, serializeGuideVersionSourceRefs } from "@/lib/learn-sources";
import { createLogger, createTaskLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";

const log = createLogger("guide-refine");

const REFINE_BATCH_SIZE = 2;

export const POST = withLogging(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
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
    sources: Array<{ type: string; content?: string; url?: string; filename?: string; savedSourceId?: string; savedSourceVersionId?: string }>;
    instructions?: string;
    model?: string;
  };

  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return NextResponse.json({ error: "At least one source is required" }, { status: 400 });
  }

  let newSourceTexts: string[];
  let sourcesToSave: GuideSourcePayload[];
  try {
    const resolved = await resolveGuideSources(guide.profileId, sources);
    newSourceTexts = resolved.sourceTexts;
    sourcesToSave = resolved.sourcesToSave;
  } catch (error) {
    if (error instanceof GuideSourceResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
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

  log.info("section_relevance_classified", { guideId: id, relevantCount: relevantSectionIds.length, totalSections: sectionPlan.length });

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
    await persistGuideSources(tx, guide.id, sourcesToSave);

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
    const task = createTaskLogger("guide-refine", guide.id);
    try {
      const allSourceTexts = await getActiveGuideSourceTexts(guide.id);

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
        task.step("full_refine_start", { guideId: id });
        const result = await refineGuide(currentContent, allSourceTexts, { instructions, model });
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
          task.step("refine_batch_start", { sectionIds: batch });

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
              task.step("section_refine_failed", { sectionId, error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)) });
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
      const sourceRefs = await getGuideVersionSourceRefs(guide.id);
      await prisma.$transaction(async (tx) => {
        await tx.guideVersion.create({
          data: {
            guideId: guide.id,
            version: newVersion,
            content: JSON.stringify(resultContent),
            changeDescription,
            snapshotSemantics: "current_head",
            sourceRefs: serializeGuideVersionSourceRefs(sourceRefs),
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

      task.complete({ refinedSections: refinedSections.length, failedSections, newVersion });
    } catch (err) {
      task.fail(err);
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
});
