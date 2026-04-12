import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ARTICLE_SOURCE_TYPES, suggestGuidesForSource } from "@/lib/learn-sources";
import { scrapeArticleUrl } from "@/lib/parsers/web";

function isRefreshableSource(type: string, url: string | null): boolean {
  return !!url && (ARTICLE_SOURCE_TYPES.has(type) || type === "article");
}

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const sources = await prisma.savedSource.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        url: true,
        title: true,
        createdAt: true,
        captureMethod: true,
        publisher: true,
        publishedAt: true,
        lastRefreshedAt: true,
      },
    });

    return NextResponse.json({
      sources: sources.map((source) => ({
        ...source,
        refreshable: isRefreshableSource(source.type, source.url),
      })),
    });
  } catch (error) {
    console.error("Saved sources list error:", error);
    return NextResponse.json({ error: "Failed to list saved sources" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const { url, title, content, fallbackContent, type } = await request.json();
    const fallbackText = typeof fallbackContent === "string" ? fallbackContent : content;

    if (!url || !type) {
      return NextResponse.json(
        { error: "url and type are required" },
        { status: 400 }
      );
    }

    const validTypes = ["medium", "substack", "article"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Duplicate check by URL
    const existing = await prisma.savedSource.findFirst({
      where: { profileId: profile.id, url },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This article has already been saved", duplicate: true },
        { status: 409 }
      );
    }

    let normalizedTitle = typeof title === "string" ? title.trim() : "";
    let normalizedContent = "";
    let captureMethod: string = "dom_fallback";
    let publisher: string | null = null;
    let publishedAt: string | null = null;

    try {
      const article = await scrapeArticleUrl(url);
      if (article.text.trim().length >= 50) {
        normalizedTitle = article.title.trim() || normalizedTitle;
        normalizedContent = article.text.trim();
        publisher = article.publisher?.trim() || null;
        publishedAt = article.date?.trim() || null;
        captureMethod = "scraped";
      }
    } catch (error) {
      console.warn("[saved-source] Article scrape failed, falling back to DOM capture", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!normalizedContent) {
      if (typeof fallbackText !== "string" || fallbackText.trim().length < 50) {
        return NextResponse.json(
          { error: "Could not extract article content from the page or server scrape." },
          { status: 400 }
        );
      }
      normalizedContent = fallbackText.trim();
      if (!normalizedTitle) normalizedTitle = "Untitled";
      captureMethod = "dom_fallback";
    }

    const saved = await prisma.savedSource.create({
      data: {
        profileId: profile.id,
        url,
        title: normalizedTitle,
        content: normalizedContent,
        type,
        captureMethod,
        publisher,
        publishedAt,
      },
    });

    const suggestions = await suggestGuidesForSource(saved.title, saved.content);

    return NextResponse.json({
      id: saved.id,
      url: saved.url,
      title: saved.title,
      type: saved.type,
      captureMethod: saved.captureMethod,
      publisher: saved.publisher,
      publishedAt: saved.publishedAt,
      lastRefreshedAt: saved.lastRefreshedAt,
      createdAt: saved.createdAt,
      refreshable: isRefreshableSource(saved.type, saved.url),
      suggestions,
    });
  } catch (error) {
    console.error("Save source error:", error);
    return NextResponse.json({ error: "Failed to save source" }, { status: 500 });
  }
}
