import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    let recommendations: unknown[] = [];
    if (profile.recommendations) {
      try { recommendations = JSON.parse(profile.recommendations); } catch { /* corrupt data, return empty */ }
    }
    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Recommendations fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch recommendations" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const { recommendations } = await request.json();
    if (!Array.isArray(recommendations)) {
      return NextResponse.json({ error: "recommendations must be an array" }, { status: 400 });
    }
    const updated = await prisma.profile.update({
      where: { id: profile.id },
      data: { recommendations: JSON.stringify(recommendations) },
    });
    return NextResponse.json(
      updated.recommendations ? JSON.parse(updated.recommendations) : []
    );
  } catch (error) {
    console.error("Recommendations update error:", error);
    return NextResponse.json({ error: "Failed to update recommendations" }, { status: 500 });
  }
}
