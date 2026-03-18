import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json([]);
    }

    const skills = await prisma.skill.findMany({
      where: { profileId: profile.id },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    // Group by category
    const grouped: Record<string, typeof skills> = {};
    for (const skill of skills) {
      if (!grouped[skill.category]) grouped[skill.category] = [];
      grouped[skill.category].push(skill);
    }

    return NextResponse.json({ skills, grouped });
  } catch (error) {
    console.error("Skills fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 }
    );
  }
}
