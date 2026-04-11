import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshRecommendationsCache } from "@/lib/learn-cache";

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
          select: { id: true, type: true, url: true, title: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        versions: {
          select: { id: true, version: true, changeDescription: true, createdAt: true },
          orderBy: { version: "desc" },
        },
      },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...guide,
      content: JSON.parse(guide.content),
      tags: JSON.parse(guide.tags),
      sectionProgress: JSON.parse(guide.sectionProgress),
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
