import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assessRefreshDegradation,
  buildSavedSourceReviewUrl,
  isRefreshableArticleSource,
  parseCaptureDiagnostics,
  parseReviewFlags,
  prepareSavedArticleCapture,
  shouldCreateSavedSourceVersion,
  stringifyCaptureDiagnostics,
  stringifyReviewFlags,
} from "@/lib/saved-sources";
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
        captureDecisionReason: true,
        captureDiagnostics: true,
        publisher: true,
        publishedAt: true,
        lastRefreshedAt: true,
        deletedAt: true,
        content: true,
        createdAt: true,
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (source.deletedAt) {
      return NextResponse.json(
        { error: "This source was deleted. Restore or replace it before refreshing." },
        { status: 410 }
      );
    }

    if (!isRefreshableArticleSource(source.type, source.url)) {
      return NextResponse.json(
        { error: "Only URL-backed article sources can be refreshed" },
        { status: 400 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const fallbackContent = typeof body.fallbackContent === "string"
      ? body.fallbackContent
      : typeof body.content === "string"
      ? body.content
      : null;
    const fallbackDiagnostics =
      body.fallbackDiagnostics && typeof body.fallbackDiagnostics === "object"
        ? body.fallbackDiagnostics
        : null;

    const prepared = await prepareSavedArticleCapture({
      url: source.url,
      title: source.title,
      fallbackContent,
      fallbackDiagnostics,
      allowFallback: typeof fallbackContent === "string" && fallbackContent.trim().length >= 50,
    });
    const degradation = assessRefreshDegradation(source, prepared);
    const candidateReviewFlags = stringifyReviewFlags(prepared.reviewFlags);
    const candidateDiagnostics = stringifyCaptureDiagnostics(prepared.captureDiagnostics);

    if (degradation.rejected) {
      return NextResponse.json({
        id: source.id,
        type: source.type,
        url: source.url,
        title: source.title,
        version: source.version,
        wordCount: source.wordCount,
        captureMethod: source.captureMethod,
        captureDecisionReason: source.captureDecisionReason,
        captureDiagnostics: parseCaptureDiagnostics(source.captureDiagnostics),
        publisher: source.publisher,
        publishedAt: source.publishedAt,
        lastRefreshedAt: source.lastRefreshedAt,
        reviewFlags: parseReviewFlags(source.reviewFlags),
        reviewSummary: source.reviewSummary,
        createdAt: source.createdAt,
        deletedAt: source.deletedAt,
        reviewUrl: buildSavedSourceReviewUrl(source.id),
        refreshable: true,
        unchanged: true,
        status: "rejected_degradation",
        message: "Refresh candidate was rejected because it looked worse than the current saved extract.",
        rejectionReasons: degradation.reasons,
        candidate: {
          title: prepared.title,
          url: prepared.canonicalUrl,
          wordCount: prepared.wordCount,
          captureMethod: prepared.captureMethod,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics: parseCaptureDiagnostics(candidateDiagnostics),
          reviewFlags: parseReviewFlags(candidateReviewFlags),
          reviewSummary: prepared.reviewSummary,
        },
      });
    }

    const refreshedAt = new Date();
    const refreshed = await prisma.$transaction(async (tx) => {
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
            captureDiagnostics: candidateDiagnostics,
            publisher: prepared.publisher,
            publishedAt: prepared.publishedAt,
            wordCount: prepared.wordCount,
            reviewFlags: candidateReviewFlags,
            reviewSummary: prepared.reviewSummary,
            changeType: "refresh",
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
            reviewFlags: candidateReviewFlags,
            reviewSummary: prepared.reviewSummary,
            captureMethod: prepared.captureMethod,
            captureDecisionReason: prepared.captureDecisionReason,
            captureDiagnostics: candidateDiagnostics,
            publisher: prepared.publisher,
            publishedAt: prepared.publishedAt,
            lastRefreshedAt: refreshedAt,
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
          lastRefreshedAt: refreshedAt,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics: candidateDiagnostics,
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

    if ("duplicate" in refreshed && refreshed.duplicate) {
      return duplicateResponse(refreshed.duplicate);
    }

    const suggestions = await suggestGuidesForSourceBestEffort(
      refreshed.source.title,
      refreshed.source.content
    );

    return NextResponse.json({
      id: refreshed.source.id,
      type: refreshed.source.type,
      url: refreshed.source.url,
      title: refreshed.source.title,
      version: refreshed.source.version,
      wordCount: refreshed.source.wordCount,
      captureMethod: refreshed.source.captureMethod,
      captureDecisionReason: refreshed.source.captureDecisionReason,
      captureDiagnostics: parseCaptureDiagnostics(refreshed.source.captureDiagnostics),
      publisher: refreshed.source.publisher,
      publishedAt: refreshed.source.publishedAt,
      lastRefreshedAt: refreshed.source.lastRefreshedAt,
      reviewFlags: parseReviewFlags(refreshed.source.reviewFlags),
      reviewSummary: refreshed.source.reviewSummary,
      createdAt: refreshed.source.createdAt,
      deletedAt: refreshed.source.deletedAt,
      reviewUrl: buildSavedSourceReviewUrl(refreshed.source.id),
      refreshable: true,
      unchanged: refreshed.unchanged,
      status: refreshed.unchanged ? "unchanged" : "updated",
      suggestions,
    });
  } catch (error) {
    console.error("Saved source refresh error:", error);
    return NextResponse.json({ error: "Failed to refresh source" }, { status: 500 });
  }
}
