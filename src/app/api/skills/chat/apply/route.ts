import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface SkillInput {
  id?: string;
  name: string;
  category: string;
}

export async function POST(request: NextRequest) {
  try {
    const { skills } = await request.json();

    if (!Array.isArray(skills)) {
      return NextResponse.json(
        { error: "skills array is required" },
        { status: 400 }
      );
    }

    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json(
        { error: "No profile found" },
        { status: 404 }
      );
    }

    // Delete all existing skills and recreate — simpler than diffing
    await prisma.skill.deleteMany({ where: { profileId: profile.id } });

    const created = await Promise.all(
      skills.map((s: SkillInput) =>
        prisma.skill.create({
          data: {
            profileId: profile.id,
            name: s.name,
            category: s.category,
          },
        })
      )
    );

    return NextResponse.json({ skills: created });
  } catch (error) {
    console.error("Apply skills error:", error);
    return NextResponse.json(
      { error: "Failed to apply skill changes" },
      { status: 500 }
    );
  }
}
