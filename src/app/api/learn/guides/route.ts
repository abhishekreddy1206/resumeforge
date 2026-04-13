import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GuideOutlineValidationError,
  GuideSectionValidationError,
  generateGuideOutline,
  generateGuideSection,
  matchGuideToPath,
} from "@/lib/claude";
import type { GuideContentStorage, GuideOutline } from "@/lib/claude";
import { GuideSourceResolutionError, type GuideSourcePayload, getActiveGuideSourceTexts, getGuideVersionSourceRefs, persistGuideSources, resolveGuideSources, serializeGuideVersionSourceRefs } from "@/lib/learn-sources";
import { deriveGuideGenerationSnapshot, ensureGuideContentTracking } from "@/lib/learn-guides";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { createLogger, createTaskLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";

const log = createLogger("guides");

const SECTION_BATCH_SIZE = 1;
const SECTION_ATTEMPTS_PER_RUN = 2;

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export const GET = withLogging(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const pathId = searchParams.get("pathId");

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (status) where.status = status;
  if (pathId) where.learningPathId = pathId;

  const guides = await prisma.guide.findMany({
    where,
    select: {
      id: true, topic: true, slug: true, version: true, status: true,
      category: true, tags: true, completionStatus: true,
      learningPathId: true, createdAt: true, updatedAt: true,
      _count: { select: { sources: true, versions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = guides.map((g) => ({
    ...g,
    tags: JSON.parse(g.tags),
    sourceCount: g._count.sources,
    versionCount: g._count.versions,
    _count: undefined,
  }));

  return NextResponse.json(result);
});

export const POST = withLogging(async (request: NextRequest) => {
  const profile = await prisma.profile.findFirst();
  if (!profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 404 });
  }

  const body = await request.json();
  const { topic, sources, difficulty, model } = body as {
    topic: string;
    sources?: Array<{ type: string; content?: string; url?: string; filename?: string; savedSourceId?: string; savedSourceVersionId?: string }>;
    difficulty?: string;
    model?: string;
  };

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  let sourceTexts: string[];
  let sourcesToSave: GuideSourcePayload[];
  try {
    const resolved = await resolveGuideSources(profile.id, sources);
    sourceTexts = resolved.sourceTexts;
    sourcesToSave = resolved.sourcesToSave;
  } catch (error) {
    if (error instanceof GuideSourceResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (sources && sources.length > 0 && sourceTexts.length === 0) {
    return NextResponse.json({ error: "No usable source content was provided" }, { status: 400 });
  }

  // Generate outline (~15s) instead of full guide (~8 min)
  let outline: GuideOutline;
  try {
    outline = await generateGuideOutline(topic, {
      sources: sourceTexts.length > 0 ? sourceTexts : undefined,
      difficulty,
      model,
    });
  } catch (error) {
    if (error instanceof GuideOutlineValidationError) {
      return NextResponse.json(
        { error: "Could not build a structurally valid guide outline. Please try again." },
        { status: 422 }
      );
    }
    throw error;
  }

  // Build skeleton content with empty sections.
  // _sectionPlan preserves original scopes so the resume endpoint can pass
  // them to generateGuideSection (without it, scope is lost after creation).
  // _sectionStatuses tracks per-section generation progress.
  const sectionStatuses: Record<string, "pending" | "generating" | "completed" | "failed" | "refining"> = {};
  for (const sp of outline.sectionPlan) {
    sectionStatuses[sp.id] = "pending";
  }

  const skeletonContent: GuideContentStorage = {
    title: outline.title,
    overview: outline.overview,
    estimatedMinutes: outline.estimatedMinutes,
    difficulty: outline.difficulty,
    prerequisites: outline.prerequisites,
    sections: outline.sectionPlan.map((sp) => ({
      id: sp.id,
      title: sp.title,
      explanation: "",
      codeExamples: [],
      knowledgeChecks: [],
      interviewScenarios: [],
      keyTakeaways: [],
    })),
    references: outline.references,
    _sectionPlan: outline.sectionPlan,
    _sectionStatuses: sectionStatuses,
    _sectionErrors: {},
    _sectionAttempts: {},
  };

  let slug = slugify(topic);
  const existing = await prisma.guide.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Save skeleton guide with status "generating"
  const guide = await prisma.$transaction(async (tx) => {
    const g = await tx.guide.create({
      data: {
        topic: topic.trim(),
        slug,
        content: JSON.stringify(skeletonContent),
        status: "generating",
        category: outline.difficulty,
        tags: JSON.stringify([]),
        profileId: profile.id,
        lastAsyncError: null,
        lastAsyncStage: null,
      },
    });

    await persistGuideSources(tx, g.id, sourcesToSave);

    return g;
  });

  log.info("guide_created", { guideId: guide.id, sectionCount: outline.sectionPlan.length, sourceCount: sourcesToSave.length });

  // Use after() to keep the runtime alive for background section generation.
  // Generates sections in parallel batches of SECTION_BATCH_SIZE.
  // If after() fails mid-way, the client auto-resumes via /resume endpoint.
  after(async () => {
    const task = createTaskLogger("guide-create", guide.id);
    try {
      task.step("started", { sectionCount: outline.sectionPlan.length, batchSize: SECTION_BATCH_SIZE });
      const siblingTitles = outline.sectionPlan.map((sp) => sp.title);
      let completedCount = 0;
      let failedCount = 0;

      // Load sources from DB (consistent with resume endpoint)
      const sources = await getActiveGuideSourceTexts(guide.id);

      for (let i = 0; i < outline.sectionPlan.length; i += SECTION_BATCH_SIZE) {
        const batch = outline.sectionPlan.slice(i, i + SECTION_BATCH_SIZE);
        const batchNum = Math.floor(i / SECTION_BATCH_SIZE) + 1;
        task.step("batch_start", { batch: batchNum, sectionCount: batch.length });

        // Mark batch sections as "generating" before starting
        const preUpdate = await prisma.guide.findUnique({ where: { id: guide.id } });
        if (preUpdate) {
          const preContent = ensureGuideContentTracking(JSON.parse(preUpdate.content) as GuideContentStorage);
          for (const sp of batch) {
            if (preContent._sectionStatuses) preContent._sectionStatuses[sp.id] = "generating";
          }
          await prisma.guide.update({
            where: { id: guide.id },
            data: { content: JSON.stringify(preContent) },
          });
        }

        // Fire batch in parallel
        const results = await Promise.allSettled(
          batch.map((sp) =>
            generateGuideSection(topic, sp, { difficulty: outline.difficulty, siblingTitles }, {
              sources: sources.length > 0 ? sources : undefined,
              model,
              maxAttempts: SECTION_ATTEMPTS_PER_RUN,
            })
          )
        );

        const batchResults = results.map((r, j) => `${batch[j].title}: ${r.status}`).join(", ");
        task.step("batch_complete", { batch: batchNum, results: batchResults });

        // Merge results into stored guide with per-section status updates
        const current = await prisma.guide.findUnique({ where: { id: guide.id } });
        if (current) {
          const currentContent = ensureGuideContentTracking(JSON.parse(current.content) as GuideContentStorage);
          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const sectionId = batch[j].id;
            if (result.status === "fulfilled") {
              const idx = currentContent.sections.findIndex((s) => s.id === sectionId);
              if (idx !== -1) currentContent.sections[idx] = result.value.section;
              if (currentContent._sectionStatuses) currentContent._sectionStatuses[sectionId] = "completed";
              if (currentContent._sectionErrors) delete currentContent._sectionErrors[sectionId];
              if (currentContent._sectionAttempts) {
                currentContent._sectionAttempts[sectionId] = (currentContent._sectionAttempts[sectionId] || 0) + result.value.attempts;
              }
              completedCount++;
            } else {
              task.step("section_failed", { sectionTitle: batch[j].title, error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)) });
              if (currentContent._sectionStatuses) currentContent._sectionStatuses[sectionId] = "failed";
              if (currentContent._sectionAttempts) {
                currentContent._sectionAttempts[sectionId] =
                  (currentContent._sectionAttempts[sectionId] || 0) +
                  (result.reason instanceof GuideSectionValidationError ? result.reason.attempts : 1);
              }
              if (currentContent._sectionErrors) {
                const message = result.reason instanceof GuideSectionValidationError
                  ? result.reason.issues.join("; ")
                  : result.reason instanceof Error
                  ? result.reason.message
                  : "Section generation failed";
                currentContent._sectionErrors[sectionId] = message.slice(0, 500);
              }
              failedCount++;
            }
          }
          await prisma.guide.update({
            where: { id: guide.id },
            data: { content: JSON.stringify(currentContent) },
          });
        }
      }

      const finalGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
      if (!finalGuide) {
        return;
      }
      const finalContent = ensureGuideContentTracking(JSON.parse(finalGuide.content) as GuideContentStorage);
      const snapshot = deriveGuideGenerationSnapshot(finalContent, finalGuide.status);
      const finalStatus = snapshot.generationState === "complete" ? "published" : "generating";
      const lastAsyncError = snapshot.failedSectionIds.length > 0
        ? `${snapshot.failedSectionIds.length} section${snapshot.failedSectionIds.length === 1 ? "" : "s"} blocked. Resume generation to retry.`
        : null;
      const sourceRefs = finalStatus === "published"
        ? await getGuideVersionSourceRefs(guide.id)
        : [];

      await prisma.$transaction(async (tx) => {
        await tx.guide.update({
          where: { id: guide.id },
          data: {
            content: JSON.stringify(finalContent),
            status: finalStatus,
            lastAsyncError,
            lastAsyncStage: snapshot.failedSectionIds.length > 0 ? "create_sections" : null,
          },
        });

        if (finalStatus === "published") {
          await tx.guideVersion.upsert({
            where: {
              guideId_version: {
                guideId: guide.id,
                version: finalGuide.version,
              },
            },
            create: {
              guideId: guide.id,
              version: finalGuide.version,
              content: JSON.stringify(finalContent),
              changeDescription: "Initial guide generation",
              snapshotSemantics: "current_head",
              sourceRefs: serializeGuideVersionSourceRefs(sourceRefs),
            },
            update: {
              content: JSON.stringify(finalContent),
              changeDescription: "Initial guide generation",
              snapshotSemantics: "current_head",
              sourceRefs: serializeGuideVersionSourceRefs(sourceRefs),
            },
          });
        }
      });

      task.complete({ completedSections: completedCount, failedSections: failedCount, finalStatus });

      // Auto-link to matching learning path
      try {
        const allPaths = await prisma.learningPath.findMany({
          include: { guides: { select: { topic: true } } },
        });

        if (allPaths.length > 0) {
          const currentGuide = await prisma.guide.findUnique({
            where: { id: guide.id },
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
                where: { id: guide.id },
                data: { learningPathId: match.pathId },
              });

              const matchedPath = await prisma.learningPath.findUnique({
                where: { id: match.pathId },
                select: { guideOrder: true, title: true },
              });
              if (matchedPath) {
                const order = JSON.parse(matchedPath.guideOrder) as string[];
                if (!order.includes(guide.id)) {
                  order.push(guide.id);
                  await prisma.learningPath.update({
                    where: { id: match.pathId },
                    data: { guideOrder: JSON.stringify(order) },
                  });
                }
                task.step("auto_linked_to_path", { pathTitle: matchedPath.title, confidence: match.confidence });
              }
            }
          }
        }
      } catch (err) {
        task.step("auto_link_failed", { error: err instanceof Error ? err : new Error(String(err)) });
      }

      refreshRecommendationsCache().catch((err) => {
        const bgLog = createLogger("guides");
        bgLog.error("recommendation_refresh_failed", { error: err instanceof Error ? err : new Error(String(err)) });
      });
    } catch (err) {
      task.fail(err);
      await prisma.guide.update({
        where: { id: guide.id },
        data: {
          status: "generating",
          lastAsyncError: err instanceof Error ? err.message.slice(0, 500) : "Guide generation crashed",
          lastAsyncStage: "create_sections",
        },
      }).catch(() => {});
    }
  });

  return NextResponse.json({
    id: guide.id,
    slug: guide.slug,
    topic: guide.topic,
    status: "generating",
    content: skeletonContent,
  });
});
