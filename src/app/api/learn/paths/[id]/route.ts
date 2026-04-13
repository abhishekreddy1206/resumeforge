import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("learn-path");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const path = await prisma.learningPath.findUnique({
      where: { id },
      include: {
        guides: {
          select: {
            id: true, topic: true, slug: true, status: true, completionStatus: true,
            version: true, category: true, updatedAt: true,
            sectionProgress: true,
            _count: { select: { sources: true } },
          },
        },
      },
    });

    if (!path) {
      return NextResponse.json({ error: "Learning path not found" }, { status: 404 });
    }

    const guideOrder = JSON.parse(path.guideOrder) as string[];
    const mapGuide = (g: (typeof path.guides)[number]) => {
      const { _count, ...rest } = g;
      return { ...rest, sourceCount: _count.sources };
    };
    const orderedGuides = guideOrder
      .map((gid) => path.guides.find((g) => g.id === gid))
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map(mapGuide);
    const orderedIds = new Set(guideOrder);
    const unordered = path.guides.filter((g) => !orderedIds.has(g.id)).map(mapGuide);

    return NextResponse.json({
      ...path,
      guideOrder,
      guides: [...orderedGuides, ...unordered],
    });
  } catch (error) {
    log.error("path_get_failed", { error: error instanceof Error ? error : new Error(String(error)) });
    return NextResponse.json({ error: "Failed to get learning path" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, guideOrder, category, addGuideIds, removeGuideIds } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (guideOrder !== undefined) data.guideOrder = JSON.stringify(guideOrder);

    const path = await prisma.learningPath.update({ where: { id }, data });

    if (addGuideIds && Array.isArray(addGuideIds)) {
      await prisma.guide.updateMany({
        where: { id: { in: addGuideIds } },
        data: { learningPathId: id },
      });
    }

    if (removeGuideIds && Array.isArray(removeGuideIds)) {
      await prisma.guide.updateMany({
        where: { id: { in: removeGuideIds }, learningPathId: id },
        data: { learningPathId: null },
      });
    }

    return NextResponse.json(path);
  } catch (error) {
    log.error("path_update_failed", { error: error instanceof Error ? error : new Error(String(error)) });
    return NextResponse.json({ error: "Failed to update learning path" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.guide.updateMany({
      where: { learningPathId: id },
      data: { learningPathId: null },
    });
    await prisma.learningPath.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("path_delete_failed", { error: error instanceof Error ? error : new Error(String(error)) });
    return NextResponse.json({ error: "Failed to delete learning path" }, { status: 500 });
  }
}
