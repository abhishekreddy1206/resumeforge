import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planCurriculum, generateGuideOutline } from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { createLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";
import { enqueueJobs } from "@/lib/job-queue";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

const log = createLogger("path-gen");

export const POST = withLogging(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
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
      const sectionStatuses = Object.fromEntries(
        outline.sectionPlan.map((section) => [section.id, "pending" as const])
      );
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

    // Step 4: Enqueue section generation jobs for all guides
    for (const { topic, outline } of outlines) {
      const guide = createdGuides.find((g) => g.topic === topic);
      if (!guide) continue;

      const groupKey = `create-${guide.id}`;
      const siblingTitles = outline.sectionPlan.map((sp) => sp.title);

      const jobs = outline.sectionPlan.map((sp) => ({
        type: "guide-section" as const,
        payload: {
          guideId: guide.id,
          topic,
          sectionPlan: sp,
          difficulty: outline.difficulty,
          siblingTitles,
        },
        opts: {
          priority: 5, // lower than individual guide creation
          maxAttempts: 3,
          groupKey,
          entityId: guide.id,
          entityType: "guide",
        },
      }));

      await enqueueJobs(jobs);

      log.info("path_guide_jobs_enqueued", { guideId: guide.id, jobCount: jobs.length, groupKey });
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
  } catch (error) {
    log.error("path_generate_failed", { error });
    return NextResponse.json({ error: "Failed to generate curriculum" }, { status: 500 });
  }
});
