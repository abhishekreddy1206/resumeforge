import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildSavedSourceReviewUrl,
  isRefreshableArticleSource,
  parseCaptureDiagnostics,
  parseReviewFlags,
  evaluateManualSavedSourceEdit,
} from "@/lib/saved-sources";

export async function GET(
  _request: NextRequest,
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
        type: true,
        url: true,
        title: true,
        content: true,
        version: true,
        wordCount: true,
        contentHash: true,
        captureMethod: true,
        captureDecisionReason: true,
        captureDiagnostics: true,
        publisher: true,
        publishedAt: true,
        lastRefreshedAt: true,
        reviewFlags: true,
        reviewSummary: true,
        deletedAt: true,
        createdAt: true,
        versions: {
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            url: true,
            title: true,
            captureMethod: true,
            captureDecisionReason: true,
            captureDiagnostics: true,
            publisher: true,
            publishedAt: true,
            wordCount: true,
            reviewFlags: true,
            reviewSummary: true,
            changeType: true,
            createdAt: true,
          },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const impactedGuideSources = await prisma.guideSource.findMany({
      where: {
        savedSourceId: source.id,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        savedSourceVersionId: true,
        savedSourceVersion: {
          select: {
            version: true,
          },
        },
        guide: {
          select: {
            id: true,
            slug: true,
            topic: true,
            version: true,
            updatedAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: source.id,
      type: source.type,
      url: source.url,
      title: source.title,
      content: source.content,
      version: source.version,
      wordCount: source.wordCount,
      contentHash: source.contentHash,
      captureMethod: source.captureMethod,
      captureDecisionReason: source.captureDecisionReason,
      captureDiagnostics: parseCaptureDiagnostics(source.captureDiagnostics),
      publisher: source.publisher,
      publishedAt: source.publishedAt,
      lastRefreshedAt: source.lastRefreshedAt,
      reviewFlags: parseReviewFlags(source.reviewFlags),
      reviewSummary: source.reviewSummary,
      deletedAt: source.deletedAt,
      createdAt: source.createdAt,
      preview: source.content.slice(0, 800),
      reviewUrl: buildSavedSourceReviewUrl(source.id),
      refreshable: isRefreshableArticleSource(source.type, source.url),
      versions: source.versions.map((version) => ({
        ...version,
        reviewFlags: parseReviewFlags(version.reviewFlags),
        captureDiagnostics: parseCaptureDiagnostics(version.captureDiagnostics),
      })),
      impactedGuides: impactedGuideSources.map((guideSource) => ({
        guideId: guideSource.guide.id,
        guideSlug: guideSource.guide.slug,
        guideTopic: guideSource.guide.topic,
        guideVersion: guideSource.guide.version,
        guideSourceId: guideSource.id,
        guideSourceVersionId: guideSource.savedSourceVersionId,
        attachedSourceVersion: guideSource.savedSourceVersion?.version ?? null,
        headSourceVersion: source.version,
        isStale: (guideSource.savedSourceVersion?.version ?? source.version) < source.version,
        updatedAt: guideSource.guide.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Get saved source error:", error);
    return NextResponse.json({ error: "Failed to get source" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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
      select: { id: true, deletedAt: true },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const deletedAt = source.deletedAt ?? new Date();
    await prisma.savedSource.update({
      where: { id: source.id },
      data: { deletedAt },
    });

    return NextResponse.json({ deleted: true, deletedAt });
  } catch (error) {
    console.error("Delete saved source error:", error);
    return NextResponse.json({ error: "Failed to delete source" }, { status: 500 });
  }
}

export async function PUT(
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
        type: true,
        url: true,
        title: true,
        content: true,
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
        createdAt: true,
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (source.deletedAt) {
      return NextResponse.json({ error: "Deleted sources cannot be edited" }, { status: 409 });
    }

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title : "";
    const content = typeof body?.content === "string" ? body.content : "";

    if (!title.trim() || !content.trim()) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    const manualEdit = evaluateManualSavedSourceEdit(source, { title, content });

    if (manualEdit.unchanged) {
      return NextResponse.json({
        id: source.id,
        type: source.type,
        url: source.url,
        title: source.title,
        content: source.content,
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
        deletedAt: source.deletedAt,
        createdAt: source.createdAt,
        reviewUrl: buildSavedSourceReviewUrl(source.id),
        refreshable: isRefreshableArticleSource(source.type, source.url),
        unchanged: true,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextVersion = source.version + 1;
      await tx.savedSourceVersion.create({
        data: {
          savedSourceId: source.id,
          version: nextVersion,
          url: source.url,
          title: manualEdit.title,
          content: manualEdit.content,
          contentHash: manualEdit.review.contentHash,
          captureMethod: source.captureMethod,
          captureDecisionReason: source.captureDecisionReason,
          captureDiagnostics: source.captureDiagnostics,
          publisher: source.publisher,
          publishedAt: source.publishedAt,
          wordCount: manualEdit.review.wordCount,
          reviewFlags: manualEdit.reviewFlags,
          reviewSummary: manualEdit.review.reviewSummary,
          changeType: "manual_edit",
        },
      });

      return tx.savedSource.update({
        where: { id: source.id },
        data: {
          title: manualEdit.title,
          content: manualEdit.content,
          version: nextVersion,
          contentHash: manualEdit.review.contentHash,
          wordCount: manualEdit.review.wordCount,
          reviewFlags: manualEdit.reviewFlags,
          reviewSummary: manualEdit.review.reviewSummary,
          deletedAt: null,
        },
        select: {
          id: true,
          type: true,
          url: true,
          title: true,
          content: true,
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
          deletedAt: true,
          createdAt: true,
        },
      });
    });

    return NextResponse.json({
      id: updated.id,
      type: updated.type,
      url: updated.url,
      title: updated.title,
      content: updated.content,
      version: updated.version,
      wordCount: updated.wordCount,
      captureMethod: updated.captureMethod,
      captureDecisionReason: updated.captureDecisionReason,
      captureDiagnostics: parseCaptureDiagnostics(updated.captureDiagnostics),
      publisher: updated.publisher,
      publishedAt: updated.publishedAt,
      lastRefreshedAt: updated.lastRefreshedAt,
      reviewFlags: parseReviewFlags(updated.reviewFlags),
      reviewSummary: updated.reviewSummary,
      deletedAt: updated.deletedAt,
      createdAt: updated.createdAt,
      reviewUrl: buildSavedSourceReviewUrl(updated.id),
      refreshable: isRefreshableArticleSource(updated.type, updated.url),
      unchanged: false,
    });
  } catch (error) {
    console.error("Update saved source error:", error);
    return NextResponse.json({ error: "Failed to update source" }, { status: 500 });
  }
}
