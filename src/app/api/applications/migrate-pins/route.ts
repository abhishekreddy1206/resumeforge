import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[''""]/g, "'").replace(/\s+/g, " ").trim();
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
 * POST: One-time migration from ApplicationProfile.customDefaults to LearnedAnswer.
 */
export async function POST() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const appProfile = await prisma.applicationProfile.findUnique({
      where: { profileId: profile.id },
    });

    if (!appProfile?.customDefaults) {
      return NextResponse.json({ migrated: 0, message: "No pinned defaults to migrate" });
    }

    const raw = safeJsonParse(appProfile.customDefaults, []) as Array<Record<string, unknown>>;
    let migrated = 0;

    for (const entry of raw) {
      const question = String(entry.question || "");
      if (!question) continue;
      const normalizedQ = normalizeQuestion(question);

      // Handle both old { question, answer } and new { question, answers[], activeIndex } shapes
      let answers: Array<{ text: string }> = [];
      let activeIndex = 0;

      if ("answers" in entry && Array.isArray(entry.answers)) {
        answers = entry.answers as Array<{ text: string }>;
        activeIndex = typeof entry.activeIndex === "number" ? entry.activeIndex : 0;
      } else if (typeof entry.answer === "string") {
        answers = [{ text: entry.answer }];
      }

      for (let i = 0; i < answers.length; i++) {
        const text = answers[i]?.text;
        if (!text) continue;

        const confidence = i === activeIndex ? 80 : 60;

        try {
          await prisma.learnedAnswer.upsert({
            where: { normalizedQ_answer: { normalizedQ, answer: text } },
            create: {
              normalizedQ,
              originalQ: question,
              fieldType: "text",
              answer: text,
              confidence,
              source: "migrated",
            },
            update: {},
          });
          migrated++;
        } catch {
          // Skip duplicates silently
        }
      }
    }

    // Clear customDefaults after migration
    await prisma.applicationProfile.update({
      where: { id: appProfile.id },
      data: { customDefaults: null },
    });

    return NextResponse.json({ migrated, message: "Migration complete" });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
