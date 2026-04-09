import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface CustomDefault {
  question: string;
  answer: string;
}

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * POST: Pin a question/answer as a reusable custom default.
 * DELETE: Unpin a question from custom defaults.
 */
export async function POST(request: NextRequest) {
  try {
    const { question, answer } = await request.json();

    if (!question || !answer) {
      return NextResponse.json({ error: "question and answer are required" }, { status: 400 });
    }

    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const appProfile = await prisma.applicationProfile.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id },
      update: {},
    });

    const defaults = safeJsonParse(appProfile.customDefaults, []) as CustomDefault[];

    // Update existing or add new
    const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
    const existingIdx = defaults.findIndex(
      (d) => d.question.toLowerCase().replace(/\s+/g, " ").trim() === normalized
    );

    if (existingIdx >= 0) {
      defaults[existingIdx].answer = answer;
    } else {
      defaults.push({ question, answer });
    }

    await prisma.applicationProfile.update({
      where: { id: appProfile.id },
      data: { customDefaults: JSON.stringify(defaults) },
    });

    return NextResponse.json({ pinned: true, totalDefaults: defaults.length });
  } catch (error) {
    console.error("Pin answer error:", error);
    return NextResponse.json({ error: "Failed to pin answer" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { question } = await request.json();

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const appProfile = await prisma.applicationProfile.findUnique({
      where: { profileId: profile.id },
    });

    if (!appProfile?.customDefaults) {
      return NextResponse.json({ unpinned: true, totalDefaults: 0 });
    }

    const defaults = safeJsonParse(appProfile.customDefaults, []) as CustomDefault[];
    const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
    const filtered = defaults.filter(
      (d) => d.question.toLowerCase().replace(/\s+/g, " ").trim() !== normalized
    );

    await prisma.applicationProfile.update({
      where: { id: appProfile.id },
      data: { customDefaults: JSON.stringify(filtered) },
    });

    return NextResponse.json({ unpinned: true, totalDefaults: filtered.length });
  } catch (error) {
    console.error("Unpin answer error:", error);
    return NextResponse.json({ error: "Failed to unpin answer" }, { status: 500 });
  }
}
