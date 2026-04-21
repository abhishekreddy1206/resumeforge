import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSavedSourceReviewUrl } from "@/lib/saved-sources";
import type { GuideContentStorage } from "@/lib/claude";
import { deriveGuideGenerationSnapshot, ensureGuideContentTracking, parseTrackingColumn } from "@/lib/learn-guides";
import { createLogger } from "@/lib/logger";
import { cancelJobsByEntity } from "@/lib/job-queue";

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

    // Prefer tracking columns over content blob (fallback for pre-migration guides)
    const sectionErrors = parseTrackingColumn<Record<string, string>>(
      guide.sectionErrors, parsedContent._sectionErrors || {}
    );
    const sectionAttempts = parseTrackingColumn<Record<string, number>>(
      guide.sectionAttempts, parsedContent._sectionAttempts || {}
    );
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
      sectionErrors,
      sectionAttempts,
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
    // Cancel any pending background jobs for this guide
    await cancelJobsByEntity(id, "guide");
    await prisma.guide.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("guide_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete guide" }, { status: 500 });
  }
}
