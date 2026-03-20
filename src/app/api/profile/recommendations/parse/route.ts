import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseRecommendations } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const { text } = await request.json();
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return NextResponse.json(
        { error: "Paste at least a few lines of text containing recommendations" },
        { status: 400 }
      );
    }

    const parsed = await parseRecommendations(text);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Could not identify any recommendations in the text. Try pasting the full details." },
        { status: 400 }
      );
    }

    // Merge with existing recommendations (cap at 50 total)
    let existing: unknown[] = [];
    try {
      const raw = profile.recommendations ? JSON.parse(profile.recommendations) : [];
      existing = Array.isArray(raw) ? raw : [];
    } catch {
      existing = [];
    }
    const merged = [...existing, ...parsed].slice(0, 50);

    await prisma.profile.update({
      where: { id: profile.id },
      data: { recommendations: JSON.stringify(merged) },
    });

    return NextResponse.json({ recommendations: parsed, count: parsed.length });
  } catch (error) {
    console.error("Recommendation parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse recommendations" },
      { status: 500 }
    );
  }
}
