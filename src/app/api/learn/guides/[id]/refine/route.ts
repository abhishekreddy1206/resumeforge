import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifySectionRelevance, generateGuideOutline, GuideOutlineValidationError } from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";
import { GuideSourceResolutionError, type GuideSourcePayload, persistGuideSources, resolveGuideSources } from "@/lib/learn-sources";
import { ensureGuideContentTracking, isSectionCurrentlyInteractive } from "@/lib/learn-guides";
import { createLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";
import { enqueueJob, enqueueJobs } from "@/lib/job-queue";

const log = createLogger("guide-refine");

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

  // Mark relevant sections as "refining" in column
  let updatedSectionStatuses = guide.sectionStatuses;
  if (!shouldFullRefine) {
    const statuses: Record<string, string> = guide.sectionStatuses
      ? JSON.parse(guide.sectionStatuses)
      : { ...(existingContent._sectionStatuses || {}) };
    for (const sId of relevantSectionIds) {
      statuses[sId] = "refining";
    }
    updatedSectionStatuses = JSON.stringify(statuses);
  }

  // Save sources and update guide status in one transaction
  await prisma.$transaction(async (tx) => {
    await persistGuideSources(tx, guide.id, sourcesToSave);

    await tx.guide.update({
      where: { id: guide.id },
      data: {
        content: JSON.stringify(existingContent),
        status: "generating",
        sectionStatuses: updatedSectionStatuses,
      },
    });
  });

  const groupKey = shouldFullRefine
    ? `refine-full-${id}-${Date.now()}`
    : isGuideIncomplete
    ? `recovery-${id}-${Date.now()}`
    : `refine-${id}-${Date.now()}`;

  if (isGuideIncomplete) {
    // Incomplete guide recovery: regenerate outline synchronously (fast ~15s)
    // then enqueue section generation and refinement jobs
    const { getActiveGuideSourceTexts: getSourceTexts } = await import("@/lib/learn-sources");

    const allSourceTexts = await getSourceTexts(guide.id);
    let outline;
    try {
      outline = await generateGuideOutline(guide.topic, {
        sources: allSourceTexts.length > 0 ? allSourceTexts : undefined,
        difficulty: existingContent.difficulty,
        model,
      });
    } catch (error) {
      if (error instanceof GuideOutlineValidationError) {
        return NextResponse.json(
          { error: "Could not rebuild guide outline. Please try again." },
          { status: 422 }
        );
      }
      throw error;
    }

    // Build skeleton preserving existing good sections
    const siblingTitles = outline.sectionPlan.map((sp) => sp.title);
    const newStatuses: Record<string, "pending" | "completed"> = {};
    const skeletonSections = outline.sectionPlan.map((sp) => {
      const existing = existingContent.sections.find(
        (s) => s.id === sp.id || s.title.toLowerCase() === sp.title.toLowerCase()
      );
      if (existing && isSectionCurrentlyInteractive(existing)) {
        newStatuses[sp.id] = "completed";
        return { ...existing, id: sp.id };
      }
      newStatuses[sp.id] = "pending";
      return {
        id: sp.id, title: sp.title, explanation: "",
        codeExamples: [], knowledgeChecks: [], interviewScenarios: [], keyTakeaways: [],
      };
    });

    const skeletonContent = {
      ...existingContent,
      title: outline.title,
      overview: outline.overview || existingContent.overview,
      estimatedMinutes: outline.estimatedMinutes,
      difficulty: outline.difficulty,
      prerequisites: outline.prerequisites,
      sections: skeletonSections,
      references: outline.references,
      _sectionPlan: outline.sectionPlan,
      _sectionStatuses: newStatuses,
      _sectionErrors: {},
      _sectionAttempts: {},
    };

    // Save skeleton immediately so SSE/polling shows the outline
    await prisma.guide.update({
      where: { id: guide.id },
      data: {
        content: JSON.stringify(skeletonContent),
        sectionStatuses: JSON.stringify(newStatuses),
        sectionErrors: JSON.stringify({}),
        sectionAttempts: JSON.stringify({}),
      },
    });

    // Enqueue jobs: generate new sections + refine existing ones
    const pendingSections = outline.sectionPlan.filter((sp) => newStatuses[sp.id] === "pending");
    const completedSections = outline.sectionPlan.filter((sp) => newStatuses[sp.id] === "completed");

    const jobs = [
      // Two-phase generation for pending sections: core first, interactive second
      ...pendingSections.map((sp) => ({
        type: "guide-recovery-section-core",
        payload: {
          guideId: guide.id,
          topic: guide.topic,
          sectionPlan: sp,
          difficulty: outline.difficulty,
          siblingTitles,
          model,
        },
        opts: {
          priority: 20,
          maxAttempts: 3,
          groupKey,
          entityId: guide.id,
          entityType: "guide",
        },
      })),
      ...pendingSections.map((sp) => ({
        type: "guide-recovery-section-interactive",
        payload: {
          guideId: guide.id,
          topic: guide.topic,
          sectionPlan: sp,
          difficulty: outline.difficulty,
          model,
        },
        opts: {
          priority: 10,
          maxAttempts: 3,
          groupKey,
          entityId: guide.id,
          entityType: "guide",
        },
      })),
      // Refine existing completed sections
      ...completedSections.map((sp) => ({
        type: "guide-recovery-refine",
        payload: {
          guideId: guide.id,
          sectionId: sp.id,
          instructions,
          model,
          difficulty: outline.difficulty,
          siblingTitles,
        },
        opts: {
          priority: 5,
          maxAttempts: 2,
          groupKey,
          entityId: guide.id,
          entityType: "guide",
        },
      })),
    ];

    if (jobs.length > 0) {
      await enqueueJobs(jobs);
    }

    log.info("recovery_jobs_enqueued", { guideId: id, newSections: pendingSections.length, refineSections: completedSections.length, groupKey });
  } else if (shouldFullRefine) {
    await enqueueJob("guide-refine-full", {
      guideId: guide.id,
      instructions,
      model,
      changeDescription: "Full guide refinement with new sources",
    }, {
      groupKey,
      entityId: guide.id,
      entityType: "guide",
      priority: 10,
    });

    log.info("full_refine_job_enqueued", { guideId: id, groupKey });
  } else {
    // Per-section refine
    const siblingTitles = existingContent.sections.map((s) => s.title);
    const jobs = relevantSectionIds.map((sectionId) => ({
      type: "guide-refine-section",
      payload: {
        guideId: guide.id,
        sectionId,
        instructions,
        model,
        difficulty: existingContent.difficulty,
        siblingTitles,
      },
      opts: {
        priority: 10,
        maxAttempts: 2,
        groupKey,
        entityId: guide.id,
        entityType: "guide",
      },
    }));

    await enqueueJobs(jobs);

    const reasons = relevance.filter((r) => r.relevant).map((r) => `${r.sectionId}: ${r.reason}`);
    log.info("refine_jobs_enqueued", { guideId: id, jobCount: jobs.length, groupKey, reasons });
  }

  // Enqueue finalize job for all modes
  const changeDescription = isGuideIncomplete
    ? "Recovered incomplete guide with new sources"
    : shouldFullRefine
    ? "Full guide refinement with new sources"
    : `Refined ${relevantSectionIds.length} sections with new sources`;

  await enqueueJob("guide-refine-finalize", {
    guideId: guide.id,
    changeDescription,
  }, {
    groupKey,
    entityId: guide.id,
    entityType: "guide",
    priority: -1, // runs after section jobs
  });

  // Return immediately with classification results — refinement happens via job queue
  return NextResponse.json({
    status: "generating",
    relevantSections: relevantSectionIds,
    totalSections: sectionPlan.length,
    mode: isGuideIncomplete ? "recovery" : shouldFullRefine ? "full" : "per-section",
  });
});
