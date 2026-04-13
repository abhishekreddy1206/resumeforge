import { prisma } from "@/lib/db";
import {
  generateGuideSection,
  refineGuide,
  refineGuideSection,
  matchGuideToPath,
} from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";
import {
  getActiveGuideSourceTexts,
  getGuideVersionSourceRefs,
  serializeGuideVersionSourceRefs,
} from "@/lib/learn-sources";
import {
  deriveGuideGenerationSnapshot,
  ensureGuideContentTracking,
} from "@/lib/learn-guides";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { createTaskLogger } from "@/lib/logger";
import type { JobRecord } from "@/lib/job-queue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readGuideContent(guide: { content: string }): GuideContentStorage {
  return ensureGuideContentTracking(
    JSON.parse(guide.content) as GuideContentStorage,
  );
}

// ---------------------------------------------------------------------------
// 1. handleGuideSection — "guide-section" / "guide-recovery-section"
// ---------------------------------------------------------------------------

export async function handleGuideSection(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    guideId: string;
    topic: string;
    sectionPlan: { id: string; title: string; scope: string };
    difficulty: string;
    siblingTitles: string[];
    model?: string;
    maxAttempts?: number;
  };

  const { guideId, topic, sectionPlan, difficulty, siblingTitles, model } =
    payload;
  const maxAttempts = payload.maxAttempts ?? 2;
  const task = createTaskLogger("worker-guide-section", guideId);

  // 1. Read guide from DB
  const guide = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error(`Guide ${guideId} not found`);

  // 2. Mark section as "generating"
  const preContent = readGuideContent(guide);
  if (preContent._sectionStatuses) {
    preContent._sectionStatuses[sectionPlan.id] = "generating";
  }
  await prisma.guide.update({
    where: { id: guideId },
    data: { content: JSON.stringify(preContent) },
  });
  task.step("marked_generating", { sectionId: sectionPlan.id });

  // 3. Load source texts at runtime
  const sources = await getActiveGuideSourceTexts(guideId);

  // 4. Generate section
  task.step("generating_section", { sectionTitle: sectionPlan.title });
  const result = await generateGuideSection(topic, sectionPlan, {
    difficulty,
    siblingTitles,
  }, {
    sources: sources.length > 0 ? sources : undefined,
    model,
    maxAttempts,
  });

  // 5. Re-read guide from DB to avoid overwriting concurrent updates
  const current = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!current) throw new Error(`Guide ${guideId} disappeared during generation`);

  const currentContent = readGuideContent(current);
  const idx = currentContent.sections.findIndex(
    (s) => s.id === sectionPlan.id,
  );
  if (idx !== -1) {
    currentContent.sections[idx] = result.section;
  }
  if (currentContent._sectionStatuses) {
    currentContent._sectionStatuses[sectionPlan.id] = "completed";
  }
  if (currentContent._sectionErrors) {
    delete currentContent._sectionErrors[sectionPlan.id];
  }
  if (currentContent._sectionAttempts) {
    currentContent._sectionAttempts[sectionPlan.id] =
      (currentContent._sectionAttempts[sectionPlan.id] || 0) + result.attempts;
  }

  // 6. Save updated content
  await prisma.guide.update({
    where: { id: guideId },
    data: { content: JSON.stringify(currentContent) },
  });

  task.complete({ sectionId: sectionPlan.id, attempts: result.attempts });
}

// ---------------------------------------------------------------------------
// 2. handleGuideFinalize — "guide-finalize"
// ---------------------------------------------------------------------------

export async function handleGuideFinalize(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    guideId: string;
    topic: string;
  };

  const { guideId, topic } = payload;
  const task = createTaskLogger("worker-guide-finalize", guideId);

  // 1. Read guide
  const guide = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error(`Guide ${guideId} not found`);

  const content = readGuideContent(guide);

  // 2. Derive generation snapshot
  const snapshot = deriveGuideGenerationSnapshot(content, guide.status);
  task.step("snapshot_derived", {
    completedCount: snapshot.completedCount,
    failedCount: snapshot.failedSectionIds.length,
    totalCount: snapshot.totalCount,
    generationState: snapshot.generationState,
  });

  // 3. Determine final status
  const finalStatus =
    snapshot.generationState === "complete" ? "published" : "generating";
  const lastAsyncError =
    snapshot.failedSectionIds.length > 0
      ? `${snapshot.failedSectionIds.length} section${snapshot.failedSectionIds.length === 1 ? "" : "s"} blocked. Resume generation to retry.`
      : null;
  const lastAsyncStage =
    snapshot.failedSectionIds.length > 0 ? "create_sections" : null;

  // 4. If publishing, save version in a transaction
  if (finalStatus === "published") {
    const sourceRefs = await getGuideVersionSourceRefs(guideId);

    await prisma.$transaction(async (tx) => {
      await tx.guide.update({
        where: { id: guideId },
        data: {
          content: JSON.stringify(content),
          status: finalStatus,
          lastAsyncError,
          lastAsyncStage,
        },
      });

      await tx.guideVersion.upsert({
        where: {
          guideId_version: {
            guideId,
            version: guide.version,
          },
        },
        create: {
          guideId,
          version: guide.version,
          content: JSON.stringify(content),
          changeDescription: "Initial guide generation",
          snapshotSemantics: "current_head",
          sourceRefs: serializeGuideVersionSourceRefs(sourceRefs),
        },
        update: {
          content: JSON.stringify(content),
          changeDescription: "Initial guide generation",
          snapshotSemantics: "current_head",
          sourceRefs: serializeGuideVersionSourceRefs(sourceRefs),
        },
      });
    });
  } else {
    // Not publishing — just update status fields
    await prisma.guide.update({
      where: { id: guideId },
      data: {
        content: JSON.stringify(content),
        status: finalStatus,
        lastAsyncError,
        lastAsyncStage,
      },
    });
  }

  task.step("status_saved", { finalStatus });

  // 5. Auto-link to matching learning path if published
  if (finalStatus === "published") {
    try {
      const allPaths = await prisma.learningPath.findMany({
        include: { guides: { select: { topic: true } } },
      });

      if (allPaths.length > 0) {
        const currentGuide = await prisma.guide.findUnique({
          where: { id: guideId },
          select: { learningPathId: true },
        });

        if (!currentGuide?.learningPathId) {
          const pathsForMatching = allPaths.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            existingTopics: p.guides.map((g) => g.topic),
          }));

          const match = await matchGuideToPath(topic, pathsForMatching);

          if (match.pathId && match.confidence >= 0.6) {
            await prisma.guide.update({
              where: { id: guideId },
              data: { learningPathId: match.pathId },
            });

            const matchedPath = await prisma.learningPath.findUnique({
              where: { id: match.pathId },
              select: { guideOrder: true, title: true },
            });
            if (matchedPath) {
              const order = JSON.parse(matchedPath.guideOrder) as string[];
              if (!order.includes(guideId)) {
                order.push(guideId);
                await prisma.learningPath.update({
                  where: { id: match.pathId },
                  data: { guideOrder: JSON.stringify(order) },
                });
              }
              task.step("auto_linked_to_path", {
                pathTitle: matchedPath.title,
                confidence: match.confidence,
              });
            }
          }
        }
      }
    } catch (err) {
      task.step("auto_link_failed", {
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  // 6. Refresh recommendations cache fire-and-forget
  refreshRecommendationsCache().catch(() => {});

  task.complete({ finalStatus });
}

// ---------------------------------------------------------------------------
// 3. handleGuideRefineSection — "guide-refine-section" / "guide-recovery-refine"
// ---------------------------------------------------------------------------

export async function handleGuideRefineSection(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    guideId: string;
    sectionId: string;
    instructions?: string;
    model?: string;
    difficulty: string;
    siblingTitles: string[];
  };

  const { guideId, sectionId, instructions, model, difficulty, siblingTitles } =
    payload;
  const task = createTaskLogger("worker-refine-section", guideId);

  // 1. Read guide and find section
  const guide = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error(`Guide ${guideId} not found`);

  const content = readGuideContent(guide);
  const section = content.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Section ${sectionId} not found in guide ${guideId}`);

  // 2. Mark section as "refining"
  if (content._sectionStatuses) {
    content._sectionStatuses[sectionId] = "refining";
  }
  await prisma.guide.update({
    where: { id: guideId },
    data: { content: JSON.stringify(content) },
  });
  task.step("marked_refining", { sectionId });

  // 3. Load sources
  const sourceTexts = await getActiveGuideSourceTexts(guideId);

  // 4. Refine section
  task.step("refining_section", { sectionTitle: section.title });
  const refined = await refineGuideSection(
    guide.topic,
    section,
    sourceTexts,
    { difficulty, siblingTitles },
    { instructions, model },
  );

  // 5. Re-read guide, merge refined section
  const current = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!current) throw new Error(`Guide ${guideId} disappeared during refinement`);

  const currentContent = readGuideContent(current);
  const idx = currentContent.sections.findIndex((s) => s.id === sectionId);
  if (idx !== -1) {
    currentContent.sections[idx] = refined;
  }
  if (currentContent._sectionStatuses) {
    currentContent._sectionStatuses[sectionId] = "completed";
  }
  if (currentContent._sectionErrors) {
    delete currentContent._sectionErrors[sectionId];
  }

  // 6. Save
  await prisma.guide.update({
    where: { id: guideId },
    data: { content: JSON.stringify(currentContent) },
  });

  task.complete({ sectionId });
}

// ---------------------------------------------------------------------------
// 4. handleGuideRefineFull — "guide-refine-full"
// ---------------------------------------------------------------------------

export async function handleGuideRefineFull(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    guideId: string;
    instructions?: string;
    model?: string;
  };

  const { guideId, instructions, model } = payload;
  const task = createTaskLogger("worker-refine-full", guideId);

  // 1. Read guide
  const guide = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error(`Guide ${guideId} not found`);

  const content = readGuideContent(guide);

  // 2. Load sources
  const sourceTexts = await getActiveGuideSourceTexts(guideId);
  task.step("sources_loaded", { sourceCount: sourceTexts.length });

  // 3. Call refineGuide
  task.step("refining_full_guide");
  const result = await refineGuide(content, sourceTexts, {
    instructions,
    model,
  });

  // 4. Build resultContent preserving tracking metadata from original
  const resultContent = ensureGuideContentTracking({
    ...result.content,
    _sectionPlan: content._sectionPlan,
    _sectionStatuses: content._sectionStatuses,
    _sectionErrors: content._sectionErrors,
    _sectionAttempts: content._sectionAttempts,
  });

  // 5. Mark all sections as "completed", clear all errors
  if (resultContent._sectionStatuses) {
    for (const s of resultContent.sections) {
      resultContent._sectionStatuses[s.id] = "completed";
    }
  }
  if (resultContent._sectionErrors) {
    resultContent._sectionErrors = {};
  }

  // 6. Save to DB
  await prisma.guide.update({
    where: { id: guideId },
    data: { content: JSON.stringify(resultContent) },
  });

  task.complete({
    sectionCount: resultContent.sections.length,
    changeDescription: result.changeDescription,
  });
}

// ---------------------------------------------------------------------------
// 5. handleGuideRefineFinalize — "guide-refine-finalize"
// ---------------------------------------------------------------------------

export async function handleGuideRefineFinalize(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    guideId: string;
    changeDescription: string;
  };

  const { guideId, changeDescription } = payload;
  const task = createTaskLogger("worker-refine-finalize", guideId);

  // 1. Read guide
  const guide = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error(`Guide ${guideId} not found`);

  const content = readGuideContent(guide);

  // 2. Count failed/completed sections
  const statuses = content._sectionStatuses || {};
  let completedCount = 0;
  let failedCount = 0;
  for (const section of content.sections) {
    const status = statuses[section.id] || "pending";
    if (status === "completed") completedCount++;
    if (status === "failed") failedCount++;
  }

  task.step("section_counts", {
    completedCount,
    failedCount,
    totalCount: content.sections.length,
  });

  // 3. If all failed (completedCount === 0): restore to published with error
  if (completedCount === 0) {
    await prisma.guide.update({
      where: { id: guideId },
      data: {
        status: "published",
        lastAsyncError: `All ${failedCount} section${failedCount === 1 ? "" : "s"} could not be refined. Existing content was preserved.`,
        lastAsyncStage: "refine_sections",
      },
    });
    task.complete({ outcome: "all_failed_restored" });
    return;
  }

  // 4. Increment version, create GuideVersion, mark published
  const newVersion = guide.version + 1;
  const sourceRefs = await getGuideVersionSourceRefs(guideId);
  const lastAsyncError =
    failedCount > 0
      ? `${failedCount} section${failedCount === 1 ? "" : "s"} could not be refined. Existing content was preserved.`
      : null;
  const lastAsyncStage = failedCount > 0 ? "refine_sections" : null;

  await prisma.$transaction(async (tx) => {
    await tx.guideVersion.create({
      data: {
        guideId,
        version: newVersion,
        content: JSON.stringify(content),
        changeDescription,
        snapshotSemantics: "current_head",
        sourceRefs: serializeGuideVersionSourceRefs(sourceRefs),
      },
    });

    await tx.guide.update({
      where: { id: guideId },
      data: {
        content: JSON.stringify(content),
        version: newVersion,
        status: "published",
        lastAsyncError,
        lastAsyncStage,
      },
    });
  });

  task.complete({
    outcome: failedCount > 0 ? "partial_success" : "success",
    newVersion,
    completedCount,
    failedCount,
  });
}
