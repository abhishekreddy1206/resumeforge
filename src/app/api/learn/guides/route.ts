import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuide } from "@/lib/claude";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";

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

    const content = await generateGuide(topic, {
      sources: sourceTexts.length > 0 ? sourceTexts : undefined,
      difficulty,
      model,
    });

    let slug = slugify(topic);
    const existing = await prisma.guide.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const guide = await prisma.$transaction(async (tx) => {
      const g = await tx.guide.create({
        data: {
          topic: topic.trim(),
          slug,
          content: JSON.stringify(content),
          status: "published",
          category: content.difficulty,
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

    return NextResponse.json({
      id: guide.id,
      slug: guide.slug,
      topic: guide.topic,
      content,
    });
  } catch (error) {
    console.error("Guide create error:", error);
    return NextResponse.json({ error: "Failed to create guide" }, { status: 500 });
  }
}
