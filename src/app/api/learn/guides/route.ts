import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GuideOutlineValidationError,
  generateGuideOutline,
} from "@/lib/claude";
import type { GuideContentStorage, GuideOutline } from "@/lib/claude";
import { GuideSourceResolutionError, type GuideSourcePayload, persistGuideSources, resolveGuideSources } from "@/lib/learn-sources";
import { createLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";
import { enqueueJobs } from "@/lib/job-queue";

const log = createLogger("guides");

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

  // Enqueue one job per section + a finalize job
  const groupKey = `create-${guide.id}`;
  const sectionJobs = outline.sectionPlan.map((sp) => ({
    type: "guide-section",
    payload: {
      guideId: guide.id,
      topic: topic.trim(),
      sectionPlan: sp,
      difficulty: outline.difficulty,
      siblingTitles: outline.sectionPlan.map((s) => s.title),
      model,
    },
    opts: {
      priority: 10,
      maxAttempts: 3,
      groupKey,
      entityId: guide.id,
      entityType: "guide",
    },
  }));

  await enqueueJobs(sectionJobs);

  log.info("guide_jobs_enqueued", { guideId: guide.id, jobCount: sectionJobs.length, groupKey });

  return NextResponse.json({
    id: guide.id,
    slug: guide.slug,
    topic: guide.topic,
    status: "generating",
    content: skeletonContent,
  });
});
