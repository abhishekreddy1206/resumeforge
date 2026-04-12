import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuideOutline, generateGuideSection, matchGuideToPath } from "@/lib/claude";
import type { GuideSection, GuideContent } from "@/lib/claude";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";
import { refreshRecommendationsCache } from "@/lib/learn-cache";

const SECTION_BATCH_SIZE = 2;

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
      sources?: Array<{ type: string; content?: string; url?: string; filename?: string }>;
      difficulty?: string;
      model?: string;
    };

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    // Parse sources (same as before)
    const sourceTexts: string[] = [];
    const sourcesToSave: Array<{ type: string; url?: string; title?: string; content: string }> = [];

    if (sources) {
      for (const src of sources) {
        if (src.type === "text" && src.content) {
          sourceTexts.push(src.content);
          sourcesToSave.push({ type: "text", content: src.content, title: "Pasted text" });
        } else if ((src.type === "url" || src.type === "substack" || src.type === "medium") && src.url) {
          const article = await scrapeArticleUrl(src.url);
          sourceTexts.push(`${article.title}\n\n${article.text}`);
          sourcesToSave.push({ type: src.type, url: src.url, title: article.title, content: article.text });
        } else if (src.type === "pdf" && src.content) {
          const buffer = Buffer.from(src.content, "base64");
          const text = await parsePdf(buffer);
          sourceTexts.push(text);
          sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
        } else if (src.type === "docx" && src.content) {
          const buffer = Buffer.from(src.content, "base64");
          const text = await parseDocx(buffer);
          sourceTexts.push(text);
          sourcesToSave.push({ type: "docx", content: text, title: src.filename || "Uploaded DOCX" });
        }
      }
    }

    // Generate outline (~15s) instead of full guide (~8 min)
    const outline = await generateGuideOutline(topic, {
      sources: sourceTexts.length > 0 ? sourceTexts : undefined,
      difficulty,
      model,
    });

    // Build skeleton content with empty sections
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
    // This is the optimistic path — if after() fails, the client auto-resumes
    // via the /resume endpoint which generates sections synchronously.
    after(async () => {
      try {
        console.log(`[guide-create] after() callback STARTED for guide ${guide.id} (${outline.sectionPlan.length} sections)`);
        const siblingTitles = outline.sectionPlan.map((sp) => sp.title);
        let completedCount = 0;
        let failedCount = 0;

        for (let i = 0; i < outline.sectionPlan.length; i += SECTION_BATCH_SIZE) {
          const batch = outline.sectionPlan.slice(i, i + SECTION_BATCH_SIZE);
          console.log(`[guide-create] Starting batch ${Math.floor(i / SECTION_BATCH_SIZE) + 1}: ${batch.map((s) => s.title).join(", ")}`);

          const results = await Promise.allSettled(
            batch.map((sp) =>
              generateGuideSection(topic, sp, { difficulty: outline.difficulty, siblingTitles }, {
                sources: sourceTexts.length > 0 ? sourceTexts : undefined,
                model,
              })
            )
          );

          console.log(`[guide-create] Batch ${Math.floor(i / SECTION_BATCH_SIZE) + 1} results: ${results.map((r, j) => `${batch[j].title}: ${r.status}`).join(", ")}`);

          // Merge completed sections into the stored guide
          const completedSections: Array<{ id: string; section: GuideSection }> = [];
          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            if (result.status === "fulfilled") {
              completedSections.push({ id: batch[j].id, section: result.value });
              completedCount++;
            } else {
              console.error(`[guide-create] Section "${batch[j].title}" failed:`, result.reason);
              failedCount++;
            }
          }

          if (completedSections.length > 0) {
            const current = await prisma.guide.findUnique({ where: { id: guide.id } });
            if (current) {
              const currentContent = JSON.parse(current.content) as GuideContent;
              for (const { id, section } of completedSections) {
                const idx = currentContent.sections.findIndex((s) => s.id === id);
                if (idx !== -1) {
                  currentContent.sections[idx] = section;
                }
              }
              await prisma.guide.update({
                where: { id: guide.id },
                data: { content: JSON.stringify(currentContent) },
              });
            }
          }
        }

        // Set final status
        const finalStatus = completedCount === 0 ? "failed" : "published";
        await prisma.guide.update({
          where: { id: guide.id },
          data: { status: finalStatus },
        });

        console.log(`[guide-create] Guide ${guide.id} complete: ${completedCount} sections, ${failedCount} failed → ${finalStatus}`);

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
                  order.push(guide.id);
                  await prisma.learningPath.update({
                    where: { id: match.pathId },
                    data: { guideOrder: JSON.stringify(order) },
                  });
                  console.log(`[guide-create] Auto-linked to path "${matchedPath.title}" (confidence: ${match.confidence})`);
                }
              } else {
                console.log(`[guide-create] No matching path (best: ${match.pathId ? match.confidence.toFixed(2) : "none"})`);
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
          data: { status: "failed" },
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
