import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const certifications = await prisma.certification.findMany({
      where: { profileId: profile.id },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(certifications);
  } catch (error) {
    console.error("Certifications fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch certifications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const data = await request.json();
    if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const certification = await prisma.certification.create({
      data: {
        profileId: profile.id,
        name: data.name,
        issuer: data.issuer || null,
        date: data.date || null,
        expiryDate: data.expiryDate || null,
        credentialId: data.credentialId || null,
        url: data.url || null,
      },
    });
    return NextResponse.json(certification);
  } catch (error) {
    console.error("Certification create error:", error);
    return NextResponse.json({ error: "Failed to create certification" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const certification = await prisma.certification.update({
      where: { id: data.id },
      data: {
        name: data.name,
        issuer: data.issuer ?? undefined,
        date: data.date ?? undefined,
        expiryDate: data.expiryDate ?? undefined,
        credentialId: data.credentialId ?? undefined,
        url: data.url ?? undefined,
      },
    });
    return NextResponse.json(certification);
  } catch (error) {
    console.error("Certification update error:", error);
    return NextResponse.json({ error: "Failed to update certification" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await prisma.certification.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Certification delete error:", error);
    return NextResponse.json({ error: "Failed to delete certification" }, { status: 500 });
  }
}
