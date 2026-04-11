import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const sources = await prisma.savedSource.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, url: true, title: true, createdAt: true },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Saved sources list error:", error);
    return NextResponse.json({ error: "Failed to list saved sources" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const { url, title, content, type } = await request.json();

    if (!url || !title || !content) {
      return NextResponse.json(
        { error: "url, title, and content are required" },
        { status: 400 }
      );
    }

    if (typeof content !== "string" || content.trim().length < 50) {
      return NextResponse.json(
        { error: "Content must be at least 50 characters" },
        { status: 400 }
      );
    }

    const validTypes = ["medium", "substack", "article"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Duplicate check by URL
    const existing = await prisma.savedSource.findFirst({
      where: { profileId: profile.id, url },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This article has already been saved", duplicate: true },
        { status: 409 }
      );
    }

    const saved = await prisma.savedSource.create({
      data: {
        profileId: profile.id,
        url,
        title: title.trim(),
        content: content.trim(),
        type,
      },
    });

    return NextResponse.json({
      id: saved.id,
      url: saved.url,
      title: saved.title,
      type: saved.type,
      createdAt: saved.createdAt,
    });
  } catch (error) {
    console.error("Save source error:", error);
    return NextResponse.json({ error: "Failed to save source" }, { status: 500 });
  }
}
