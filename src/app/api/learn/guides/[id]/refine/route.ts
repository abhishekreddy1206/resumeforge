import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refineGuide, refineGuideSection, classifySectionRelevance, generateGuideOutline, generateGuideSection, GuideSectionValidationError, GuideOutlineValidationError } from "@/lib/claude";
import type { GuideContentStorage, SectionGenStatus } from "@/lib/claude";
import { GuideSourceResolutionError, type GuideSourcePayload, getActiveGuideSourceTexts, getGuideVersionSourceRefs, persistGuideSources, resolveGuideSources, serializeGuideVersionSourceRefs } from "@/lib/learn-sources";
import { ensureGuideContentTracking, isSectionCurrentlyInteractive } from "@/lib/learn-guides";
import { createLogger, createTaskLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";

const log = createLogger("guide-refine");

const REFINE_BATCH_SIZE = 2;
const SECTION_GEN_BATCH_SIZE = 1;
const SECTION_ATTEMPTS_PER_RUN = 2;

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

  const existingContent = ensureGuideContentTracking(JSON.parse(guide.content) as GuideContentStorage);

  // Smart source routing: classify which sections benefit from new sources
  const sectionPlan = existingContent._sectionPlan || existingContent.sections.map((s) => ({
    id: s.id,
    title: s.title,
    scope: s.explanation.slice(0, 200),
  }));

  // Detect incomplete guides: fewer than 4 sections with no saved section plan
  const isGuideIncomplete = existingContent.sections.length < 4
    && (!existingContent._sectionPlan || existingContent._sectionPlan.length === 0);

  const relevance = await classifySectionRelevance(sectionPlan, newSourceTexts, { model });
  const relevantSectionIds = relevance.filter((r) => r.relevant).map((r) => r.sectionId);

  log.info("section_relevance_classified", { guideId: id, relevantCount: relevantSectionIds.length, totalSections: sectionPlan.length, isGuideIncomplete });

  // If all sections are relevant or user wants full restructure, fall back to full refine
  // Never use full refine for incomplete guides — it times out trying to generate everything at once
  const shouldFullRefine = !isGuideIncomplete && (
    relevantSectionIds.length === sectionPlan.length ||
    (instructions && instructions.toLowerCase().includes("restructure"))
  );

  if (relevantSectionIds.length === 0 && !shouldFullRefine && !isGuideIncomplete) {
    return NextResponse.json({
      status: "noop",
      relevantSections: [],
      totalSections: sectionPlan.length,
      mode: "none",
      message: "No guide sections matched the new source closely enough to refine.",
    });
  }

  // Mark relevant sections as "refining"
  if (!shouldFullRefine) {
    const sectionStatuses = existingContent._sectionStatuses || {};
    for (const sId of relevantSectionIds) {
      sectionStatuses[sId] = "refining";
    }
    existingContent._sectionStatuses = sectionStatuses;
  }

  // Save sources and update guide status in one transaction
  await prisma.$transaction(async (tx) => {
    await persistGuideSources(tx, guide.id, sourcesToSave);

    await tx.guide.update({
      where: { id: guide.id },
      data: {
        content: JSON.stringify(existingContent),
        status: "generating",
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
      const currentContent = ensureGuideContentTracking(JSON.parse(currentGuide.content) as GuideContentStorage);

      let resultContent: GuideContentStorage;
      let changeDescription: string;
      const refinedSections: string[] = [];
      let failedSections = 0;

      if (isGuideIncomplete) {
        // Incomplete guide recovery: generate fresh outline, then build sections individually
        task.step("incomplete_guide_recovery_start", { existingSections: currentContent.sections.length, guideId: id });

        const outline = await generateGuideOutline(guide.topic, {
          sources: allSourceTexts.length > 0 ? allSourceTexts : undefined,
          difficulty: currentContent.difficulty,
          model,
        });

        task.step("outline_generated", { sectionCount: outline.sectionPlan.length });

        // Build skeleton with tracking, preserving existing good sections
        const siblingTitles = outline.sectionPlan.map((sp) => sp.title);
        const sectionStatuses: Record<string, SectionGenStatus> = {};
        const sectionAttempts: Record<string, number> = {};
        const sectionErrors: Record<string, string> = {};

        resultContent = ensureGuideContentTracking({
          title: outline.title,
          overview: outline.overview || currentContent.overview,
          estimatedMinutes: outline.estimatedMinutes,
          difficulty: outline.difficulty,
          prerequisites: outline.prerequisites,
          sections: outline.sectionPlan.map((sp) => {
            // Try to reuse existing section content
            const existing = currentContent.sections.find(
              (s) => s.id === sp.id || s.title.toLowerCase() === sp.title.toLowerCase()
            );
            if (existing && isSectionCurrentlyInteractive(existing)) {
              sectionStatuses[sp.id] = "completed";
              return { ...existing, id: sp.id };
            }
            sectionStatuses[sp.id] = "pending";
            return {
              id: sp.id, title: sp.title, explanation: "",
              codeExamples: [], knowledgeChecks: [], interviewScenarios: [], keyTakeaways: [],
            };
          }),
          references: outline.references,
          _sectionPlan: outline.sectionPlan,
          _sectionStatuses: sectionStatuses,
          _sectionErrors: sectionErrors,
          _sectionAttempts: sectionAttempts,
        });

        // Save skeleton immediately so polling shows the outline
        await prisma.guide.update({
          where: { id: guide.id },
          data: { content: JSON.stringify(resultContent) },
        });

        // Generate missing sections and refine existing ones in batches
        const pendingSections = outline.sectionPlan.filter((sp) => sectionStatuses[sp.id] === "pending");
        const completedExisting = outline.sectionPlan.filter((sp) => sectionStatuses[sp.id] === "completed");

        // Generate new sections
        for (let i = 0; i < pendingSections.length; i += SECTION_GEN_BATCH_SIZE) {
          const batch = pendingSections.slice(i, i + SECTION_GEN_BATCH_SIZE);
          task.step("gen_batch_start", { sectionIds: batch.map((sp) => sp.id) });

          // Mark as generating
          const preGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
          if (preGuide) {
            const preContent = ensureGuideContentTracking(JSON.parse(preGuide.content) as GuideContentStorage);
            for (const sp of batch) {
              if (preContent._sectionStatuses) preContent._sectionStatuses[sp.id] = "generating";
            }
            await prisma.guide.update({ where: { id: guide.id }, data: { content: JSON.stringify(preContent) } });
          }

          const results = await Promise.allSettled(
            batch.map((sp) =>
              generateGuideSection(guide.topic, sp, { difficulty: outline.difficulty, siblingTitles }, {
                sources: allSourceTexts.length > 0 ? allSourceTexts : undefined,
                model,
                maxAttempts: SECTION_ATTEMPTS_PER_RUN,
              })
            )
          );

          // Merge results
          const latest = await prisma.guide.findUnique({ where: { id: guide.id } });
          if (!latest) return;
          const latestContent = ensureGuideContentTracking(JSON.parse(latest.content) as GuideContentStorage);

          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const sectionId = batch[j].id;
            if (result.status === "fulfilled") {
              const idx = latestContent.sections.findIndex((s) => s.id === sectionId);
              if (idx !== -1) latestContent.sections[idx] = result.value.section;
              if (latestContent._sectionStatuses) latestContent._sectionStatuses[sectionId] = "completed";
              if (latestContent._sectionErrors) delete latestContent._sectionErrors[sectionId];
              if (latestContent._sectionAttempts) {
                latestContent._sectionAttempts[sectionId] = (latestContent._sectionAttempts[sectionId] || 0) + result.value.attempts;
              }
              refinedSections.push(sectionId);
            } else {
              task.step("section_gen_failed", { sectionId, error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)) });
              if (latestContent._sectionStatuses) latestContent._sectionStatuses[sectionId] = "failed";
              if (latestContent._sectionErrors) {
                const message = result.reason instanceof GuideSectionValidationError
                  ? result.reason.issues.join("; ")
                  : result.reason instanceof Error ? result.reason.message : "Section generation failed";
                latestContent._sectionErrors[sectionId] = message.slice(0, 500);
              }
              failedSections++;
            }
          }

          await prisma.guide.update({ where: { id: guide.id }, data: { content: JSON.stringify(latestContent) } });
        }

        // Refine existing sections with new sources
        for (const sp of completedExisting) {
          const latestGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
          if (!latestGuide) return;
          const latestContent = ensureGuideContentTracking(JSON.parse(latestGuide.content) as GuideContentStorage);
          const section = latestContent.sections.find((s) => s.id === sp.id);
          if (!section) continue;

          try {
            if (latestContent._sectionStatuses) latestContent._sectionStatuses[sp.id] = "refining";
            await prisma.guide.update({ where: { id: guide.id }, data: { content: JSON.stringify(latestContent) } });

            const refined = await refineGuideSection(
              guide.topic, section, allSourceTexts,
              { difficulty: currentContent.difficulty, siblingTitles },
              { instructions, model }
            );
            const afterGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
            if (!afterGuide) return;
            const afterContent = ensureGuideContentTracking(JSON.parse(afterGuide.content) as GuideContentStorage);
            const idx = afterContent.sections.findIndex((s) => s.id === sp.id);
            if (idx !== -1) afterContent.sections[idx] = refined;
            if (afterContent._sectionStatuses) afterContent._sectionStatuses[sp.id] = "completed";
            if (afterContent._sectionErrors) delete afterContent._sectionErrors[sp.id];
            await prisma.guide.update({ where: { id: guide.id }, data: { content: JSON.stringify(afterContent) } });
            refinedSections.push(sp.id);
          } catch (err) {
            task.step("section_refine_failed", { sectionId: sp.id, error: err instanceof Error ? err : new Error(String(err)) });
            const errGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
            if (errGuide) {
              const errContent = ensureGuideContentTracking(JSON.parse(errGuide.content) as GuideContentStorage);
              if (errContent._sectionStatuses) errContent._sectionStatuses[sp.id] = "completed";
              await prisma.guide.update({ where: { id: guide.id }, data: { content: JSON.stringify(errContent) } });
            }
            failedSections++;
          }
        }

        changeDescription = `Recovered incomplete guide: generated ${pendingSections.length} new sections, refined ${completedExisting.length} existing`;

        // Re-read final state
        const finalGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
        if (finalGuide) {
          resultContent = ensureGuideContentTracking(JSON.parse(finalGuide.content) as GuideContentStorage);
        }
      } else if (shouldFullRefine) {
        task.step("full_refine_start", { guideId: id });
        const result = await refineGuide(currentContent, allSourceTexts, { instructions, model });
        resultContent = ensureGuideContentTracking({
          ...result.content,
          _sectionPlan: currentContent._sectionPlan,
          _sectionStatuses: currentContent._sectionStatuses,
          _sectionErrors: currentContent._sectionErrors,
          _sectionAttempts: currentContent._sectionAttempts,
        });
        changeDescription = result.changeDescription;
        if (resultContent._sectionStatuses) {
          for (const s of resultContent.sections) {
            resultContent._sectionStatuses[s.id] = "completed";
          }
        }
        if (resultContent._sectionErrors) {
          resultContent._sectionErrors = {};
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
          const latestContent = ensureGuideContentTracking(JSON.parse(latestGuide.content) as GuideContentStorage);

          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const sectionId = batch[j];
            if (result.status === "fulfilled") {
              const idx = latestContent.sections.findIndex((s) => s.id === sectionId);
              if (idx !== -1) latestContent.sections[idx] = result.value;
              if (latestContent._sectionStatuses) latestContent._sectionStatuses[sectionId] = "completed";
              if (latestContent._sectionErrors) delete latestContent._sectionErrors[sectionId];
              refinedSections.push(sectionId);
            } else {
              task.step("section_refine_failed", { sectionId, error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)) });
              if (latestContent._sectionStatuses) latestContent._sectionStatuses[sectionId] = "completed"; // restore original
              if (latestContent._sectionErrors) {
                const message = result.reason instanceof Error
                  ? result.reason.message
                  : "Section refinement failed";
                latestContent._sectionErrors[sectionId] = message.slice(0, 500);
              }
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
          resultContent = ensureGuideContentTracking(JSON.parse(finalGuide.content) as GuideContentStorage);
        }
      }

      if (refinedSections.length === 0 && failedSections > 0) {
        await prisma.guide.update({
          where: { id: guide.id },
          data: {
            status: "published",
            lastAsyncError: `${failedSections} section${failedSections === 1 ? "" : "s"} could not be refined. Existing content was preserved.`,
            lastAsyncStage: "refine_sections",
          },
        });
        return;
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
    mode: isGuideIncomplete ? "recovery" : shouldFullRefine ? "full" : "per-section",
  });
});
