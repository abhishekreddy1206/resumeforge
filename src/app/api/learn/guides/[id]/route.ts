import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { buildSavedSourceReviewUrl } from "@/lib/saved-sources";
import type { GuideContentStorage } from "@/lib/claude";
import { deriveGuideGenerationSnapshot, ensureGuideContentTracking } from "@/lib/learn-guides";
import { createLogger } from "@/lib/logger";

const log = createLogger("guide");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        sources: {
          where: { isActive: true },
          select: {
            id: true,
            type: true,
            url: true,
            title: true,
            createdAt: true,
            savedSourceId: true,
            savedSourceVersionId: true,
          },
          orderBy: { createdAt: "asc" },
        },
        versions: {
          select: {
            id: true,
            version: true,
            changeDescription: true,
            snapshotSemantics: true,
            sourceRefs: true,
            createdAt: true,
          },
          orderBy: { version: "desc" },
        },
      },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const parsedContent = ensureGuideContentTracking(JSON.parse(guide.content) as GuideContentStorage);
    const generationSnapshot = deriveGuideGenerationSnapshot(parsedContent, guide.status);

    const staleGuideSources = await prisma.guideSource.findMany({
      where: {
        guideId: guide.id,
        isActive: true,
        savedSourceId: { not: null },
      },
      select: {
        id: true,
        title: true,
        savedSourceId: true,
        savedSourceVersionId: true,
        savedSourceVersion: {
          select: {
            version: true,
          },
        },
        savedSource: {
          select: {
            version: true,
          },
        },
      },
    });

    return NextResponse.json({
      ...guide,
      content: parsedContent,
      tags: JSON.parse(guide.tags),
      sectionProgress: JSON.parse(guide.sectionProgress),
      generationState: generationSnapshot.generationState,
      failedSectionIds: generationSnapshot.failedSectionIds,
      sectionErrors: parsedContent._sectionErrors || {},
      sectionAttempts: parsedContent._sectionAttempts || {},
      staleSources: staleGuideSources.map((source) => {
        const attachedVersion = source.savedSourceVersion?.version ?? null;
        const headVersion = source.savedSource?.version ?? attachedVersion ?? null;
        return {
          savedSourceId: source.savedSourceId,
          guideSourceId: source.id,
          sourceTitle: source.title,
          attachedVersion,
          headVersion,
          isStale: attachedVersion !== null && headVersion !== null
            ? attachedVersion < headVersion
            : false,
          reviewUrl: source.savedSourceId ? buildSavedSourceReviewUrl(source.savedSourceId) : null,
        };
      }),
    });
  } catch (error) {
    log.error("guide_get_failed", { error });
    return NextResponse.json({ error: "Failed to get guide" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, category, tags, completionStatus, sectionProgress } = body;

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (category !== undefined) data.category = category;
    if (tags !== undefined) data.tags = JSON.stringify(tags);
    if (completionStatus !== undefined) data.completionStatus = completionStatus;
    if (sectionProgress !== undefined) data.sectionProgress = JSON.stringify(sectionProgress);

    const guide = await prisma.guide.update({ where: { id }, data });
    return NextResponse.json(guide);
  } catch (error) {
    log.error("guide_update_failed", { error });
    return NextResponse.json({ error: "Failed to update guide" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.guide.delete({ where: { id } });

    // Eagerly refresh recommendations cache (guide topics changed)
    refreshRecommendationsCache().catch((err) =>
      log.error("recommendation_refresh_failed", { error: err })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("guide_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete guide" }, { status: 500 });
  }
}
