import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSavedSourceReviewUrl, isRefreshableArticleSource, parseCaptureDiagnostics, parseReviewFlags, prepareSavedArticleCapture, shouldCreateSavedSourceVersion, stringifyCaptureDiagnostics, stringifyReviewFlags } from "@/lib/saved-sources";
import { normalizeArticleUrl } from "@/lib/utils/normalize-url";
import { suggestGuidesForSourceBestEffort } from "@/lib/learn-sources";

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
      error: "This article already exists under a different saved source",
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const { id } = await params;
    const source = await prisma.savedSource.findFirst({
      where: { id, profileId: profile.id },
      select: {
        id: true,
        profileId: true,
        type: true,
        url: true,
        title: true,
        version: true,
        contentHash: true,
        wordCount: true,
        reviewFlags: true,
        reviewSummary: true,
        captureMethod: true,
        publisher: true,
        publishedAt: true,
        deletedAt: true,
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (!isRefreshableArticleSource(source.type, source.url)) {
      return NextResponse.json(
        { error: "Only URL-backed article sources can be replaced" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const requestUrl = typeof body.url === "string" && body.url.trim() ? body.url.trim() : source.url;
    const requestTitle = typeof body.title === "string" ? body.title : source.title;
    const fallbackContent = typeof body.fallbackContent === "string"
      ? body.fallbackContent
      : typeof body.content === "string"
      ? body.content
      : null;
    const fallbackDiagnostics =
      body.fallbackDiagnostics && typeof body.fallbackDiagnostics === "object"
        ? body.fallbackDiagnostics
        : null;

    const preNormalizedUrl = normalizeArticleUrl(requestUrl);
    const prepared = await prepareSavedArticleCapture({
      url: requestUrl,
      title: requestTitle,
      fallbackContent,
      fallbackDiagnostics,
      allowFallback: true,
    });

    if (preNormalizedUrl !== source.url && prepared.canonicalUrl !== source.url) {
      return NextResponse.json(
        {
          error: "Replacement URL does not match this saved source. Review the existing source or capture it as a new article.",
          reviewUrl: buildSavedSourceReviewUrl(source.id),
        },
        { status: 409 }
      );
    }

    const replacedAt = new Date();
    const replaced = await prisma.$transaction(async (tx) => {
      const conflictingSource = await tx.savedSource.findFirst({
        where: {
          profileId: profile.id,
          url: prepared.canonicalUrl,
          id: { not: source.id },
        },
        select: {
          id: true,
          title: true,
          version: true,
          deletedAt: true,
          captureMethod: true,
          reviewFlags: true,
        },
      });

      if (conflictingSource) {
        return { duplicate: conflictingSource } as const;
      }

      const reviewFlags = stringifyReviewFlags(prepared.reviewFlags);
      const captureDiagnostics = stringifyCaptureDiagnostics(prepared.captureDiagnostics);
      const shouldVersion = shouldCreateSavedSourceVersion(source, prepared);

      if (shouldVersion) {
        const nextVersion = source.version + 1;

        await tx.savedSourceVersion.create({
          data: {
            savedSourceId: source.id,
            version: nextVersion,
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
            changeType: "replace",
          },
        });

        const updated = await tx.savedSource.update({
          where: { id: source.id },
          data: {
            url: prepared.canonicalUrl,
            title: prepared.title,
            content: prepared.content,
            version: nextVersion,
            contentHash: prepared.contentHash,
            wordCount: prepared.wordCount,
            reviewFlags,
            reviewSummary: prepared.reviewSummary,
            captureMethod: prepared.captureMethod,
            captureDecisionReason: prepared.captureDecisionReason,
            captureDiagnostics,
            publisher: prepared.publisher,
            publishedAt: prepared.publishedAt,
            deletedAt: null,
            lastRefreshedAt: replacedAt,
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

        return { source: updated, unchanged: false } as const;
      }

      const updated = await tx.savedSource.update({
        where: { id: source.id },
        data: {
          deletedAt: null,
          lastRefreshedAt: replacedAt,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics,
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

      return { source: updated, unchanged: true } as const;
    });

    if ("duplicate" in replaced && replaced.duplicate) {
      return duplicateResponse(replaced.duplicate);
    }

    const suggestions = await suggestGuidesForSourceBestEffort(
      replaced.source.title,
      replaced.source.content
    );

    return NextResponse.json({
      id: replaced.source.id,
      type: replaced.source.type,
      url: replaced.source.url,
      title: replaced.source.title,
      version: replaced.source.version,
      wordCount: replaced.source.wordCount,
      captureMethod: replaced.source.captureMethod,
      captureDecisionReason: replaced.source.captureDecisionReason,
      captureDiagnostics: parseCaptureDiagnostics(replaced.source.captureDiagnostics),
      publisher: replaced.source.publisher,
      publishedAt: replaced.source.publishedAt,
      lastRefreshedAt: replaced.source.lastRefreshedAt,
      reviewFlags: parseReviewFlags(replaced.source.reviewFlags),
      reviewSummary: replaced.source.reviewSummary,
      createdAt: replaced.source.createdAt,
      deletedAt: replaced.source.deletedAt,
      reviewUrl: buildSavedSourceReviewUrl(replaced.source.id),
      refreshable: true,
      unchanged: replaced.unchanged,
      suggestions,
    });
  } catch (error) {
    console.error("Saved source replace error:", error);
    return NextResponse.json({ error: "Failed to replace source" }, { status: 500 });
  }
}
