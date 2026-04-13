import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { buildSavedSourceReviewUrl } from "@/lib/saved-sources";

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
      content: JSON.parse(guide.content),
      tags: JSON.parse(guide.tags),
      sectionProgress: JSON.parse(guide.sectionProgress),
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
    console.error("Guide get error:", error);
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
    console.error("Guide update error:", error);
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
      console.error("[guide-delete] Recommendation refresh failed:", err)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Guide delete error:", error);
    return NextResponse.json({ error: "Failed to delete guide" }, { status: 500 });
  }
}
