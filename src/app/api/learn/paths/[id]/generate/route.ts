import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planCurriculum, generateGuideOutline, generateGuideSection } from "@/lib/claude";
import type { GuideContent, GuideSection } from "@/lib/claude";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { createLogger, createTaskLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";

export const maxDuration = 600;

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function generateSectionsInBackground(
  guideId: string,
  topic: string,
  sectionPlan: Array<{ id: string; title: string; scope: string }>,
  difficulty: string,
  model?: string,
) {
  const task = createTaskLogger("path-gen-sections", guideId);
  const siblingTitles = sectionPlan.map((sp) => sp.title);
  const BATCH = 3;
  const completedSections: GuideSection[] = [];
  let failedCount = 0;

  for (let i = 0; i < sectionPlan.length; i += BATCH) {
    const batch = sectionPlan.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((sp) =>
        generateGuideSection(topic, sp, { difficulty, siblingTitles }, { model })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") completedSections.push(r.value);
      else { failedCount++; task.step("section_failed", { error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) }); }
    }
    // Save progress after each batch
    try {
      const g = await prisma.guide.findUnique({ where: { id: guideId } });
      if (g) {
        const content = JSON.parse(g.content) as GuideContent;
        for (const s of completedSections) {
          const idx = content.sections.findIndex((x) => x.id === s.id);
          if (idx !== -1) content.sections[idx] = s;
        }
        await prisma.guide.update({
          where: { id: guideId },
          data: { content: JSON.stringify(content) },
        });
      }
    } catch (err) {
      task.step("progress_save_failed", { error: err instanceof Error ? err : new Error(String(err)) });
    }
  }

  const status = failedCount === sectionPlan.length ? "failed" : "published";
  try {
    const g = await prisma.guide.findUnique({ where: { id: guideId } });
    if (g) {
      const content = JSON.parse(g.content) as GuideContent;
      for (const s of completedSections) {
        const idx = content.sections.findIndex((x) => x.id === s.id);
        if (idx !== -1) content.sections[idx] = s;
      }
      await prisma.guide.update({
        where: { id: guideId },
        data: { content: JSON.stringify(content), status },
      });
    }
    task.complete({ completedSections: completedSections.length, failedCount, status });
  } catch (err) {
    task.fail(err);
  }
}

const log = createLogger("path-gen");

export const POST = withLogging(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const path = await prisma.learningPath.findUnique({
    where: { id },
    include: { guides: { select: { id: true } } },
  });
  if (!path) {
    return NextResponse.json({ error: "Learning path not found" }, { status: 404 });
  }
  if (path.guides.length > 0) {
    return NextResponse.json(
      { error: "Path already has guides. Delete existing guides first to regenerate." },
      { status: 409 }
    );
  }
  const profile = await prisma.profile.findFirst();
  if (!profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 404 });
  }

  // Step 1: Plan curriculum (fast, ~12s)
  const plan = await planCurriculum(path.title, {
    description: path.description ?? undefined,
  });
  if (!plan.topics || plan.topics.length === 0) {
    return NextResponse.json({ error: "Failed to plan curriculum" }, { status: 500 });
  }

  log.info("curriculum_planned", { pathId: id, topicCount: plan.topics.length });

  // Step 2: Generate outlines in parallel batches of 3
  const OUTLINE_BATCH = 3;
  const outlines: Array<{ topic: string; difficulty: string; outline: Awaited<ReturnType<typeof generateGuideOutline>> }> = [];

  for (let i = 0; i < plan.topics.length; i += OUTLINE_BATCH) {
    const batch = plan.topics.slice(i, i + OUTLINE_BATCH);
    const results = await Promise.allSettled(
      batch.map(async (t) => {
        const outline = await generateGuideOutline(t.title, { difficulty: t.difficulty });
        return { topic: t.title, difficulty: t.difficulty, outline };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") outlines.push(r.value);
      else log.error("outline_generation_failed", { error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) });
    }
  }

  if (outlines.length === 0) {
    return NextResponse.json({ error: "Failed to generate any guide outlines" }, { status: 500 });
  }

  // Step 3: Create skeleton guides in DB
  const createdGuides: Array<{ id: string; topic: string; slug: string }> = [];
  for (const { topic, outline } of outlines) {
    const skeletonContent: GuideContent = {
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
    };

    let slug = slugify(topic);
    const existing = await prisma.guide.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const guide = await prisma.guide.create({
      data: {
        topic,
        slug,
        content: JSON.stringify(skeletonContent),
        status: "generating",
        category: outline.difficulty,
        tags: JSON.stringify([]),
        profileId: profile.id,
        learningPathId: path.id,
      },
    });

    createdGuides.push({ id: guide.id, topic: guide.topic, slug: guide.slug });
  }

  // Update guide order
  await prisma.learningPath.update({
    where: { id: path.id },
    data: { guideOrder: JSON.stringify(createdGuides.map((g) => g.id)) },
  });

  log.info("skeleton_guides_created", { pathId: id, guideCount: createdGuides.length, outlineCount: outlines.length });

  // Step 4: Fire-and-forget section generation for all guides
  for (const { topic, outline } of outlines) {
    const guide = createdGuides.find((g) => g.topic === topic);
    if (guide) {
      generateSectionsInBackground(
        guide.id,
        topic,
        outline.sectionPlan,
        outline.difficulty,
      ).catch((err) => {
        const bgLog = createLogger("path-gen");
        bgLog.error("background_generation_failed", { guideId: guide.id, error: err instanceof Error ? err : new Error(String(err)) });
      });
    }
  }

  refreshRecommendationsCache().catch((err) => {
    const bgLog = createLogger("path-gen");
    bgLog.error("recommendation_refresh_failed", { error: err instanceof Error ? err : new Error(String(err)) });
  });

  return NextResponse.json({
    planned: plan.topics.length,
    created: createdGuides.length,
    guides: createdGuides,
    status: "generating",
  });
});
