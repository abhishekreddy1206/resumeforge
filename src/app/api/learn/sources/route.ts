import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSavedSourceReviewUrl, isRefreshableArticleSource, parseCaptureDiagnostics, parseReviewFlags, prepareSavedArticleCapture, stringifyCaptureDiagnostics, stringifyReviewFlags } from "@/lib/saved-sources";
import { normalizeArticleUrl } from "@/lib/utils/normalize-url";
import { suggestGuidesForSourceBestEffort } from "@/lib/learn-sources";

function toSavedSourceListItem(source: {
  id: string;
  type: string;
  url: string;
  title: string;
  version: number;
  wordCount: number;
  captureMethod: string | null;
  publisher: string | null;
  publishedAt: string | null;
  lastRefreshedAt: Date | null;
  reviewFlags: string;
  reviewSummary: string | null;
  createdAt: Date;
  deletedAt?: Date | null;
}) {
  return {
    id: source.id,
    type: source.type,
    url: source.url,
    title: source.title,
    version: source.version,
    wordCount: source.wordCount,
    captureMethod: source.captureMethod,
    publisher: source.publisher,
    publishedAt: source.publishedAt,
    lastRefreshedAt: source.lastRefreshedAt,
    reviewFlags: parseReviewFlags(source.reviewFlags),
    reviewSummary: source.reviewSummary,
    createdAt: source.createdAt,
    reviewUrl: buildSavedSourceReviewUrl(source.id),
    refreshable: isRefreshableArticleSource(source.type, source.url),
    ...(source.deletedAt !== undefined ? { deletedAt: source.deletedAt } : {}),
  };
}

function duplicateResponse(source: {
  id: string;
  title: string;
  version: number;
  deletedAt: Date | null;
  captureMethod: string | null;
  reviewFlags: string;
}) {
  return NextResponse.json(
    {
      error: "This article has already been saved",
      duplicate: true,
      duplicateKind: "saved-source",
      existingSourceId: source.id,
      title: source.title,
      version: source.version,
      deleted: Boolean(source.deletedAt),
      captureMethod: source.captureMethod,
      reviewFlags: parseReviewFlags(source.reviewFlags),
      replaceable: true,
      reviewUrl: buildSavedSourceReviewUrl(source.id),
    },
    { status: 409 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const includeDeleted = request.nextUrl.searchParams.get("includeDeleted") === "true";

    const sources = await prisma.savedSource.findMany({
      where: {
        profileId: profile.id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        url: true,
        title: true,
        version: true,
        wordCount: true,
        captureMethod: true,
        publisher: true,
        publishedAt: true,
        lastRefreshedAt: true,
        reviewFlags: true,
        reviewSummary: true,
        createdAt: true,
        ...(includeDeleted ? { deletedAt: true } : {}),
      },
    });

    return NextResponse.json({
      sources: sources.map((source) => toSavedSourceListItem(source)),
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

    const { url, title, content, fallbackContent, fallbackDiagnostics, type } = await request.json();
    const fallbackText = typeof fallbackContent === "string" ? fallbackContent : content;

    if (!url || !type) {
      return NextResponse.json({ error: "url and type are required" }, { status: 400 });
    }

    const validTypes = ["medium", "substack", "article"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const preNormalizedUrl = normalizeArticleUrl(url);
    const preExisting = await prisma.savedSource.findFirst({
      where: { profileId: profile.id, url: preNormalizedUrl },
      select: {
        id: true,
        title: true,
        version: true,
        deletedAt: true,
        captureMethod: true,
        reviewFlags: true,
      },
    });

    if (preExisting) {
      return duplicateResponse(preExisting);
    }

    const prepared = await prepareSavedArticleCapture({
      url,
      title,
      fallbackContent: fallbackText,
      fallbackDiagnostics,
      allowFallback: true,
    });

    const saved = await prisma.$transaction(async (tx) => {
      const existing = await tx.savedSource.findFirst({
        where: { profileId: profile.id, url: prepared.canonicalUrl },
        select: {
          id: true,
          title: true,
          version: true,
          deletedAt: true,
          captureMethod: true,
          reviewFlags: true,
        },
      });

      if (existing) {
        return { duplicate: existing } as const;
      }

      const reviewFlags = stringifyReviewFlags(prepared.reviewFlags);
      const captureDiagnostics = stringifyCaptureDiagnostics(prepared.captureDiagnostics);

      const source = await tx.savedSource.create({
        data: {
          profileId: profile.id,
          type,
          url: prepared.canonicalUrl,
          title: prepared.title,
          content: prepared.content,
          version: 1,
          contentHash: prepared.contentHash,
          wordCount: prepared.wordCount,
          reviewFlags,
          reviewSummary: prepared.reviewSummary,
          captureMethod: prepared.captureMethod,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics,
          publisher: prepared.publisher,
          publishedAt: prepared.publishedAt,
        },
        select: {
          id: true,
          type: true,
          url: true,
          title: true,
          version: true,
          wordCount: true,
          captureMethod: true,
          captureDecisionReason: true,
          captureDiagnostics: true,
          publisher: true,
          publishedAt: true,
          lastRefreshedAt: true,
          reviewFlags: true,
          reviewSummary: true,
          createdAt: true,
          deletedAt: true,
          content: true,
        },
      });

      await tx.savedSourceVersion.create({
        data: {
          savedSourceId: source.id,
          version: 1,
          url: prepared.canonicalUrl,
          title: prepared.title,
          content: prepared.content,
          contentHash: prepared.contentHash,
          captureMethod: prepared.captureMethod,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics,
          publisher: prepared.publisher,
          publishedAt: prepared.publishedAt,
          wordCount: prepared.wordCount,
          reviewFlags,
          reviewSummary: prepared.reviewSummary,
          changeType: "initial",
        },
      });

      return { source } as const;
    });

    if ("duplicate" in saved && saved.duplicate) {
      return duplicateResponse(saved.duplicate);
    }

    const suggestions = await suggestGuidesForSourceBestEffort(saved.source.title, saved.source.content);

    return NextResponse.json({
      ...toSavedSourceListItem(saved.source),
      captureDecisionReason: saved.source.captureDecisionReason,
      captureDiagnostics: parseCaptureDiagnostics(saved.source.captureDiagnostics),
      suggestions,
    });
  } catch (error) {
    console.error("Save source error:", error);
    return NextResponse.json({ error: "Failed to save source" }, { status: 500 });
  }
}
