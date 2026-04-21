import { prisma } from "@/lib/db";
import {
  generateGuideSection,
  generateSectionCore,
  generateSectionInteractive,
  refineGuide,
  refineGuideSection,
  matchGuideToPath,
  classifyJobs,
} from "@/lib/claude";
import { loadInsightsSettingsFromProfile } from "@/lib/insights/settings";
import type { GuideContentStorage } from "@/lib/claude";
import {
  getActiveGuideSourceTexts,
  getGuideVersionSourceRefs,
  serializeGuideVersionSourceRefs,
} from "@/lib/learn-sources";
import {
  deriveGuideGenerationSnapshot,
  ensureGuideContentTracking,
  mergeTrackingStatus,
  mergeTrackingError,
  mergeTrackingAttempts,
  parseTrackingColumn,
} from "@/lib/learn-guides";
import { runAutoPipeline } from "@/lib/utils/auto-pipeline";
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

  // 2. Mark section as "generating" via column (no content blob r/w)
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      sectionStatuses: mergeTrackingStatus(guide.sectionStatuses, sectionPlan.id, "generating"),
    },
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

  // 6. Save updated content + tracking columns
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      content: JSON.stringify(currentContent),
      sectionStatuses: mergeTrackingStatus(current.sectionStatuses, sectionPlan.id, "completed"),
      sectionErrors: mergeTrackingError(current.sectionErrors, sectionPlan.id, null),
      sectionAttempts: mergeTrackingAttempts(current.sectionAttempts, sectionPlan.id, result.attempts),
    },
  });

  task.complete({ sectionId: sectionPlan.id, attempts: result.attempts });
}

// ---------------------------------------------------------------------------
// 1b. handleGuideSectionCore — "guide-section-core" / "guide-recovery-section-core"
// ---------------------------------------------------------------------------

export async function handleGuideSectionCore(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    guideId: string;
    topic: string;
    sectionPlan: { id: string; title: string; scope: string };
    difficulty: string;
    siblingTitles: string[];
    model?: string;
    maxAttempts?: number;
  };

  const { guideId, topic, sectionPlan, difficulty, siblingTitles, model } = payload;
  const maxAttempts = payload.maxAttempts ?? 2;
  const task = createTaskLogger("worker-section-core", guideId);

  // 1. Mark section as "generating" via column (no content blob r/w)
  const guide = await prisma.guide.findUnique({
    where: { id: guideId },
    select: { id: true, sectionStatuses: true },
  });
  if (!guide) throw new Error(`Guide ${guideId} not found`);

  await prisma.guide.update({
    where: { id: guideId },
    data: {
      sectionStatuses: mergeTrackingStatus(guide.sectionStatuses, sectionPlan.id, "generating"),
    },
  });
  task.step("marked_generating", { sectionId: sectionPlan.id });

  // 2. Load source texts
  const sources = await getActiveGuideSourceTexts(guideId);

  // 3. Generate core content (explanation + code examples)
  task.step("generating_core", { sectionTitle: sectionPlan.title });
  const result = await generateSectionCore(topic, sectionPlan, {
    difficulty,
    siblingTitles,
  }, {
    sources: sources.length > 0 ? sources : undefined,
    model,
    maxAttempts,
  });

  // 4. Re-read guide from DB to insert section data
  const current = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!current) throw new Error(`Guide ${guideId} disappeared during generation`);

  const currentContent = readGuideContent(current);
  const idx = currentContent.sections.findIndex((s) => s.id === sectionPlan.id);
  if (idx !== -1) {
    currentContent.sections[idx] = {
      ...currentContent.sections[idx],
      id: result.core.id,
      title: result.core.title,
      explanation: result.core.explanation,
      codeExamples: result.core.codeExamples,
      knowledgeChecks: [],
      interviewScenarios: [],
      keyTakeaways: [],
    };
  }

  // 5. Save content + mark "core_complete"
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      content: JSON.stringify(currentContent),
      sectionStatuses: mergeTrackingStatus(current.sectionStatuses, sectionPlan.id, "core_complete"),
      sectionErrors: mergeTrackingError(current.sectionErrors, sectionPlan.id, null),
      sectionAttempts: mergeTrackingAttempts(current.sectionAttempts, sectionPlan.id, result.attempts),
    },
  });

  task.complete({ sectionId: sectionPlan.id, attempts: result.attempts });
}

// ---------------------------------------------------------------------------
// 1c. handleGuideSectionInteractive — "guide-section-interactive" / "guide-recovery-section-interactive"
// ---------------------------------------------------------------------------

export async function handleGuideSectionInteractive(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    guideId: string;
    topic: string;
    sectionPlan: { id: string; title: string; scope: string };
    difficulty: string;
    model?: string;
    maxAttempts?: number;
  };

  const { guideId, topic, sectionPlan, difficulty, model } = payload;
  const maxAttempts = payload.maxAttempts ?? 2;
  const task = createTaskLogger("worker-section-interactive", guideId);

  // 1. Read guide to get section's core content
  const guide = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error(`Guide ${guideId} not found`);

  const content = readGuideContent(guide);
  const section = content.sections.find((s) => s.id === sectionPlan.id);

  // Guard: core content must exist before generating interactive
  if (!section || !section.explanation?.trim()) {
    throw new Error(`Section "${sectionPlan.id}" has no core content yet — cannot generate interactive`);
  }

  // 2. Mark as "generating_interactive"
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      sectionStatuses: mergeTrackingStatus(guide.sectionStatuses, sectionPlan.id, "generating_interactive"),
    },
  });
  task.step("marked_generating_interactive", { sectionId: sectionPlan.id });

  // 3. Generate interactive content
  task.step("generating_interactive", { sectionTitle: sectionPlan.title });
  const result = await generateSectionInteractive(topic, sectionPlan, {
    explanation: section.explanation,
    codeExamples: section.codeExamples,
  }, { difficulty }, { model, maxAttempts });

  // 4. Re-read guide and merge
  const current = await prisma.guide.findUnique({ where: { id: guideId } });
  if (!current) throw new Error(`Guide ${guideId} disappeared during generation`);

  const currentContent = readGuideContent(current);
  const idx = currentContent.sections.findIndex((s) => s.id === sectionPlan.id);
  if (idx !== -1) {
    currentContent.sections[idx] = {
      ...currentContent.sections[idx],
      knowledgeChecks: result.interactive.knowledgeChecks,
      interviewScenarios: result.interactive.interviewScenarios,
      keyTakeaways: result.interactive.keyTakeaways,
    };
  }

  // 5. Save content + mark "completed"
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      content: JSON.stringify(currentContent),
      sectionStatuses: mergeTrackingStatus(current.sectionStatuses, sectionPlan.id, "completed"),
      sectionErrors: mergeTrackingError(current.sectionErrors, sectionPlan.id, null),
      sectionAttempts: mergeTrackingAttempts(current.sectionAttempts, sectionPlan.id, result.attempts),
    },
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

  // 2. Mark section as "refining" via column
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      sectionStatuses: mergeTrackingStatus(guide.sectionStatuses, sectionId, "refining"),
    },
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

  // 6. Save content + tracking columns
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      content: JSON.stringify(currentContent),
      sectionStatuses: mergeTrackingStatus(current.sectionStatuses, sectionId, "completed"),
      sectionErrors: mergeTrackingError(current.sectionErrors, sectionId, null),
    },
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

  // 5. Build tracking columns: mark all sections completed, clear errors
  const allStatuses: Record<string, string> = {};
  for (const s of resultContent.sections) {
    allStatuses[s.id] = "completed";
  }

  // 6. Save content + tracking columns
  await prisma.guide.update({
    where: { id: guideId },
    data: {
      content: JSON.stringify(resultContent),
      sectionStatuses: JSON.stringify(allStatuses),
      sectionErrors: JSON.stringify({}),
      sectionAttempts: guide.sectionAttempts, // preserve attempt counts
    },
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

  // 2. Count failed/completed sections (prefer column, fallback to content)
  const statuses = parseTrackingColumn<Record<string, string>>(
    guide.sectionStatuses, content._sectionStatuses || {}
  );
  let completedCount = 0;
  let failedCount = 0;
  for (const section of content.sections) {
    const status = statuses[section.id] || "pending";
    if (status === "completed" || status === "core_complete") completedCount++;
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

// ---------------------------------------------------------------------------
// 8. handleAutoPipeline — "auto-pipeline"
// ---------------------------------------------------------------------------
//
// Runs the v2 resume quality pipeline (match → build → save → pdf) for a Job.
// Job.pipelineStatus columns track progress independently of BackgroundJob
// state, so the UI can poll Job directly.

export async function handleAutoPipeline(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as { jobId: string };
  const { jobId } = payload;
  if (!jobId) throw new Error("auto-pipeline payload missing jobId");
  await runAutoPipeline(jobId);
}

// ---------------------------------------------------------------------------
// handleClassifyJobsBatch — "classify-jobs-batch"
// ---------------------------------------------------------------------------

export async function handleClassifyJobsBatch(job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payload) as {
    jobIds: string[];
    profileId?: string;
  };
  const task = createTaskLogger("worker-classify-jobs-batch", job.id);

  const jobRows = await prisma.job.findMany({
    where: { id: { in: payload.jobIds } },
    select: {
      id: true,
      title: true,
      skills: true,
      seniority: true,
      description: true,
    },
  });
  task.step("loaded_jobs", { count: jobRows.length });

  if (jobRows.length === 0) return;

  // All jobs in a batch should share a profile (enqueuer groups by profile).
  // Fall back to the first job's profile for settings.
  const profile = payload.profileId
    ? await prisma.profile.findUnique({
        where: { id: payload.profileId },
        select: { insightsSettings: true },
      })
    : null;
  const settings = loadInsightsSettingsFromProfile({
    insightsSettings: profile?.insightsSettings ?? null,
  });

  const input = jobRows.map((j) => ({
    id: j.id,
    title: j.title,
    skills: safeParseSkills(j.skills),
    seniority: j.seniority ?? undefined,
    excerpt: buildExcerpt(j.description),
  }));

  task.step("calling_classifier", { batchSize: input.length });
  const { taxonomyVersion, results } = await classifyJobs(input, {
    model: settings.classificationModel,
  });

  const threshold = settings.classificationConfidenceThreshold;
  for (const r of results) {
    const effectiveCategoryId =
      r.confidence >= threshold ? r.categoryId : "other";
    const candidateToStore =
      r.confidence >= threshold
        ? null
        : r.candidateName ??
          (r.categoryId !== "other" ? r.categoryId : null);
    await prisma.job.update({
      where: { id: r.jobId },
      data: {
        roleCategory: effectiveCategoryId,
        roleCategoryConf: r.confidence,
        roleCategoryCandidate: candidateToStore,
        roleCategoryVersion: taxonomyVersion,
        roleClassifiedAt: new Date(),
      },
    });
  }
  task.complete({ classified: results.length });
}

function safeParseSkills(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x) => typeof x === "string").slice(0, 20);
    }
  } catch {
    // fall through
  }
  return [];
}

function buildExcerpt(description: string | null): string | undefined {
  if (!description) return undefined;
  const plain = description
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  if (plain.length <= 280) return plain;
  return plain.slice(0, 280).replace(/\s+\S*$/, "").trimEnd() + "…";
}
