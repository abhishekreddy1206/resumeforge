import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { editSkills } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const profile = await prisma.profile.findFirst({
      include: { skills: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found" },
        { status: 404 }
      );
    }

    const currentSkills = profile.skills.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    }));

    const result = await editSkills(
      currentSkills,
      message,
      history || []
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Skills chat error:", error);
    return NextResponse.json(
      { error: "Failed to process skills chat" },
      { status: 500 }
    );
  }
}
