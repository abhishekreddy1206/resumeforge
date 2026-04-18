import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GuideOutlineValidationError,
  generateGuideOutline,
} from "@/lib/claude";
import type { GuideContentStorage, GuideOutline, GuideSection, SectionGenStatus } from "@/lib/claude";
import { GuideSourceResolutionError, type GuideSourceFailure, type GuideSourcePayload, persistGuideSources, resolveGuideSources } from "@/lib/learn-sources";
import { createLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";
import { enqueueJobs } from "@/lib/job-queue";
import { getGuideProgressPercent, type SectionProgress } from "@/lib/learn-progress";

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
      content: true, sectionProgress: true,
      _count: { select: { sources: true, versions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = guides.map((g) => {
    let progressPercent = 0;
    try {
      const content = JSON.parse(g.content) as { sections?: GuideSection[] };
      const progress = JSON.parse(g.sectionProgress) as Record<string, SectionProgress>;
      progressPercent = getGuideProgressPercent(content.sections ?? [], progress);
    } catch {
      progressPercent = 0;
    }
    // Reconcile with the stored completionStatus so we never show contradictions
    // like "Not Started · 100%" — which can happen for skeleton/in-flight guides
    // where every section is empty and auto-classifies as completed.
    if (g.completionStatus === "not_started") progressPercent = 0;
    else if (g.completionStatus === "completed") progressPercent = 100;
    return {
      id: g.id,
      topic: g.topic,
      slug: g.slug,
      version: g.version,
      status: g.status,
      category: g.category,
      tags: JSON.parse(g.tags),
      completionStatus: g.completionStatus,
      learningPathId: g.learningPathId,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      sourceCount: g._count.sources,
      versionCount: g._count.versions,
      progressPercent,
    };
  });

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
  let sourceFailures: GuideSourceFailure[] = [];
  try {
    const resolved = await resolveGuideSources(profile.id, sources);
    sourceTexts = resolved.sourceTexts;
    sourcesToSave = resolved.sourcesToSave;
    sourceFailures = resolved.failures;
  } catch (error) {
    if (error instanceof GuideSourceResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (sources && sources.length > 0 && sourceTexts.length === 0) {
    return NextResponse.json({ error: "No usable source content was provided" }, { status: 400 });
  }

  if (sourceFailures.length > 0) {
    log.warn("guide_source_failures", {
      failureCount: sourceFailures.length,
      totalCount: sources?.length ?? 0,
      failures: sourceFailures.map((f) => ({ error: f.error, type: f.input.type })),
    });
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
  const sectionStatuses: Record<string, SectionGenStatus> = {};
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
        sectionStatuses: JSON.stringify(sectionStatuses),
        sectionErrors: JSON.stringify({}),
        sectionAttempts: JSON.stringify({}),
        lastAsyncError: null,
        lastAsyncStage: null,
      },
    });

    await persistGuideSources(tx, g.id, sourcesToSave);

    return g;
  });

  log.info("guide_created", { guideId: guide.id, sectionCount: outline.sectionPlan.length, sourceCount: sourcesToSave.length });

  // Enqueue two-phase jobs per section: core (explanation+code) then interactive (quizzes+scenarios)
  const groupKey = `create-${guide.id}`;
  const siblingTitles = outline.sectionPlan.map((s) => s.title);

  const coreJobs = outline.sectionPlan.map((sp) => ({
    type: "guide-section-core",
    payload: {
      guideId: guide.id,
      topic: topic.trim(),
      sectionPlan: sp,
      difficulty: outline.difficulty,
      siblingTitles,
      model,
    },
    opts: {
      priority: 20, // core jobs run first
      maxAttempts: 3,
      groupKey,
      entityId: guide.id,
      entityType: "guide",
    },
  }));

  const interactiveJobs = outline.sectionPlan.map((sp) => ({
    type: "guide-section-interactive",
    payload: {
      guideId: guide.id,
      topic: topic.trim(),
      sectionPlan: sp,
      difficulty: outline.difficulty,
      model,
    },
    opts: {
      priority: 10, // interactive jobs run after all core jobs
      maxAttempts: 3,
      groupKey,
      entityId: guide.id,
      entityType: "guide",
    },
  }));

  await enqueueJobs([...coreJobs, ...interactiveJobs]);

  log.info("guide_jobs_enqueued", { guideId: guide.id, jobCount: coreJobs.length + interactiveJobs.length, groupKey });

  return NextResponse.json({
    id: guide.id,
    slug: guide.slug,
    topic: guide.topic,
    status: "generating",
    content: skeletonContent,
    sourceWarnings: sourceFailures.map((f) => ({
      type: f.input.type,
      url: f.input.url ?? null,
      filename: f.input.filename ?? null,
      error: f.error,
    })),
  });
});
