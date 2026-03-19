import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const version = await prisma.profileVersion.findUnique({
      where: { id },
      include: {
        job: { select: { id: true, title: true, company: true } },
        resumes: {
          select: { id: true, format: true, filePath: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!version) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...version,
      snapshot: JSON.parse(version.snapshot),
    });
  } catch (error) {
    console.error("Get version error:", error);
    return NextResponse.json(
      { error: "Failed to get profile version" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.profileVersion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete version error:", error);
    return NextResponse.json(
      { error: "Failed to delete profile version" },
      { status: 500 }
    );
  }
}
