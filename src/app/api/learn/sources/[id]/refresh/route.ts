import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ARTICLE_SOURCE_TYPES, suggestGuidesForSource } from "@/lib/learn-sources";
import { scrapeArticleUrl } from "@/lib/parsers/web";

function isRefreshableSource(type: string, url: string): boolean {
  return !!url && (ARTICLE_SOURCE_TYPES.has(type) || type === "article");
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const source = await prisma.savedSource.findUnique({ where: { id } });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (!isRefreshableSource(source.type, source.url)) {
      return NextResponse.json(
        { error: "Only URL-backed article sources can be refreshed" },
        { status: 400 }
      );
    }

    const article = await scrapeArticleUrl(source.url);
    if (!article.text.trim() || article.text.trim().length < 50) {
      return NextResponse.json(
        { error: "Could not extract enough content during refresh" },
        { status: 400 }
      );
    }

    const refreshed = await prisma.savedSource.update({
      where: { id: source.id },
      data: {
        title: article.title.trim() || source.title,
        content: article.text.trim(),
        publisher: article.publisher?.trim() || null,
        publishedAt: article.date?.trim() || null,
        captureMethod: "refreshed",
        lastRefreshedAt: new Date(),
      },
    });

    const suggestions = await suggestGuidesForSource(refreshed.title, refreshed.content);

    return NextResponse.json({
      ...refreshed,
      refreshable: true,
      suggestions,
    });
  } catch (error) {
    console.error("Saved source refresh error:", error);
    return NextResponse.json({ error: "Failed to refresh source" }, { status: 500 });
  }
}
