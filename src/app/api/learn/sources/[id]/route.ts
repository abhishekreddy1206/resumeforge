import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSavedSourceReviewUrl, isRefreshableArticleSource, parseCaptureDiagnostics, parseReviewFlags } from "@/lib/saved-sources";

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
