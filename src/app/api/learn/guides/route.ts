import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuideOutline, generateGuideSection, matchGuideToPath } from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";
import { resolveGuideSources } from "@/lib/learn-sources";
import { refreshRecommendationsCache } from "@/lib/learn-cache";

const SECTION_BATCH_SIZE = 1;

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export async function GET(request: NextRequest) {
  try {
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
  } catch (error) {
    console.error("Guide list error:", error);
    return NextResponse.json({ error: "Failed to list guides" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const body = await request.json();
    const { topic, sources, difficulty, model } = body as {
      topic: string;
      sources?: Array<{ type: string; content?: string; url?: string; filename?: string; savedSourceId?: string }>;
      difficulty?: string;
      model?: string;
    };

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const { sourceTexts, sourcesToSave } = await resolveGuideSources(profile.id, sources);
    if (sources && sources.length > 0 && sourceTexts.length === 0) {
      return NextResponse.json({ error: "No usable source content was provided" }, { status: 400 });
    }

    // Generate outline (~15s) instead of full guide (~8 min)
    const outline = await generateGuideOutline(topic, {
      sources: sourceTexts.length > 0 ? sourceTexts : undefined,
      difficulty,
      model,
    });

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

      for (const src of sourcesToSave) {
        await tx.guideSource.create({
          data: {
            guideId: g.id,
            type: src.type,
            url: src.url || null,
            title: src.title || null,
            content: src.content,
          },
        });
      }

      return g;
    });

    // Use after() to keep the runtime alive for background section generation.
    // Generates sections in parallel batches of SECTION_BATCH_SIZE.
    // If after() fails mid-way, the client auto-resumes via /resume endpoint.
    after(async () => {
      try {
        console.log(`[guide-create] after() started for guide ${guide.id} (${outline.sectionPlan.length} sections, batch=${SECTION_BATCH_SIZE})`);
        const siblingTitles = outline.sectionPlan.map((sp) => sp.title);
        let completedCount = 0;
        let failedCount = 0;

        // Load sources from DB (consistent with resume endpoint)
        const guideSources = await prisma.guideSource.findMany({ where: { guideId: guide.id } });
        const sources = guideSources.map((s) => s.content);

        for (let i = 0; i < outline.sectionPlan.length; i += SECTION_BATCH_SIZE) {
          const batch = outline.sectionPlan.slice(i, i + SECTION_BATCH_SIZE);
          const batchNum = Math.floor(i / SECTION_BATCH_SIZE) + 1;
          console.log(`[guide-create] Batch ${batchNum}: ${batch.map((s) => s.title).join(", ")}`);

          // Mark batch sections as "generating" before starting
          const preUpdate = await prisma.guide.findUnique({ where: { id: guide.id } });
          if (preUpdate) {
            const preContent = JSON.parse(preUpdate.content) as GuideContentStorage;
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
              })
            )
          );

          console.log(`[guide-create] Batch ${batchNum} results: ${results.map((r, j) => `${batch[j].title}: ${r.status}`).join(", ")}`);

          // Merge results into stored guide with per-section status updates
          const current = await prisma.guide.findUnique({ where: { id: guide.id } });
          if (current) {
            const currentContent = JSON.parse(current.content) as GuideContentStorage;
            for (let j = 0; j < results.length; j++) {
              const result = results[j];
              const sectionId = batch[j].id;
              if (result.status === "fulfilled") {
                const idx = currentContent.sections.findIndex((s) => s.id === sectionId);
                if (idx !== -1) currentContent.sections[idx] = result.value;
                if (currentContent._sectionStatuses) currentContent._sectionStatuses[sectionId] = "completed";
                completedCount++;
              } else {
                console.error(`[guide-create] Section "${batch[j].title}" failed:`, result.reason);
                if (currentContent._sectionStatuses) currentContent._sectionStatuses[sectionId] = "failed";
                failedCount++;
              }
            }
            await prisma.guide.update({
              where: { id: guide.id },
              data: { content: JSON.stringify(currentContent) },
            });
          }
        }

        // Final status: any completed -> published, all failed -> failed
        const finalStatus = completedCount === 0 ? "failed" : "published";
        const lastAsyncError = failedCount > 0
          ? completedCount === 0
            ? `Guide generation failed. ${failedCount} sections could not be generated.`
            : `${failedCount} section${failedCount === 1 ? "" : "s"} failed to generate. Use Resume Generation to retry.`
          : null;
        await prisma.guide.update({
          where: { id: guide.id },
          data: {
            status: finalStatus,
            lastAsyncError,
            lastAsyncStage: failedCount > 0 ? "create_sections" : null,
          },
        });

        console.log(`[guide-create] Guide ${guide.id} done: ${completedCount} ok, ${failedCount} failed -> ${finalStatus}`);

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
                  console.log(`[guide-create] Auto-linked to path "${matchedPath.title}" (confidence: ${match.confidence})`);
                }
              }
            }
          }
        } catch (err) {
          console.error("[guide-create] Auto-link failed (non-fatal):", err);
        }

        refreshRecommendationsCache().catch((err) =>
          console.error("[guide-create] Recommendation refresh failed:", err)
        );
      } catch (err) {
        console.error("[guide-create] Background generation crashed:", err);
        await prisma.guide.update({
          where: { id: guide.id },
          data: {
            status: "failed",
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
  } catch (error) {
    console.error("Guide create error:", error);
    return NextResponse.json({ error: "Failed to create guide" }, { status: 500 });
  }
}
