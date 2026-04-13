import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("publications");

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const publications = await prisma.publication.findMany({
      where: { profileId: profile.id },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(publications);
  } catch (error) {
    log.error("publications_fetch_failed", { error });
    return NextResponse.json({ error: "Failed to fetch publications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const data = await request.json();
    if (!data.title || typeof data.title !== "string" || !data.title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const publication = await prisma.publication.create({
      data: {
        profileId: profile.id,
        title: data.title,
        publisher: data.publisher || null,
        date: data.date || null,
        url: data.url || null,
        doi: data.doi || null,
        description: data.description || null,
      },
    });
    return NextResponse.json(publication);
  } catch (error) {
    log.error("publication_create_failed", { error });
    return NextResponse.json({ error: "Failed to create publication" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const publication = await prisma.publication.update({
      where: { id: data.id },
      data: {
        title: data.title,
        publisher: data.publisher ?? undefined,
        date: data.date ?? undefined,
        url: data.url ?? undefined,
        doi: data.doi ?? undefined,
        description: data.description ?? undefined,
      },
    });
    return NextResponse.json(publication);
  } catch (error) {
    log.error("publication_update_failed", { error });
    return NextResponse.json({ error: "Failed to update publication" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await prisma.publication.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("publication_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete publication" }, { status: 500 });
  }
}
