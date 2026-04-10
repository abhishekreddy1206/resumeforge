import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const paths = await prisma.learningPath.findMany({
      include: {
        guides: {
          select: {
            id: true, topic: true, slug: true, completionStatus: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = paths.map((p) => {
      const guideOrder = JSON.parse(p.guideOrder) as string[];
      const completed = p.guides.filter((g) => g.completionStatus === "completed").length;
      return {
        ...p,
        guideOrder,
        guideCount: p.guides.length,
        completedCount: completed,
        progress: p.guides.length > 0 ? Math.round((completed / p.guides.length) * 100) : 0,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Paths list error:", error);
    return NextResponse.json({ error: "Failed to list learning paths" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, guideIds, category } = body as {
      title: string;
      description?: string;
      guideIds?: string[];
      category?: string;
    };

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const path = await prisma.learningPath.create({
      data: {
        title: title.trim(),
        description: description || null,
        category: category || null,
        guideOrder: JSON.stringify(guideIds || []),
        profileId: profile.id,
      },
    });

    if (guideIds && guideIds.length > 0) {
      await prisma.guide.updateMany({
        where: { id: { in: guideIds } },
        data: { learningPathId: path.id },
      });
    }

    return NextResponse.json(path);
  } catch (error) {
    console.error("Path create error:", error);
    return NextResponse.json({ error: "Failed to create learning path" }, { status: 500 });
  }
}
