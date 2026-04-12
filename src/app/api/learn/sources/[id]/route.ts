import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ARTICLE_SOURCE_TYPES } from "@/lib/learn-sources";

function isRefreshableSource(type: string, url: string): boolean {
  return !!url && (ARTICLE_SOURCE_TYPES.has(type) || type === "article");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const source = await prisma.savedSource.findUnique({ where: { id } });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...source,
      refreshable: isRefreshableSource(source.type, source.url),
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
    const { id } = await params;
    await prisma.savedSource.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete saved source error:", error);
    return NextResponse.json({ error: "Failed to delete source" }, { status: 500 });
  }
}
