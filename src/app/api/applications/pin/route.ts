import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface PinnedAnswer {
  text: string;
  label?: string;
}

interface PinnedQuestion {
  question: string;
  answers: PinnedAnswer[];
  activeIndex: number;
}

// Old shape for backward compat
interface LegacyDefault {
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

function normalize(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Auto-upgrade old { question, answer } entries to new shape. */
function upgradeDefaults(raw: unknown[]): PinnedQuestion[] {
  return raw.map((entry) => {
    const e = entry as PinnedQuestion | LegacyDefault;
    if ("answers" in e && Array.isArray(e.answers)) {
      return e as PinnedQuestion;
    }
    const legacy = e as LegacyDefault;
    return {
      question: legacy.question,
      answers: [{ text: legacy.answer }],
      activeIndex: 0,
    };
  });
}

async function getAppProfile() {
  const profile = await prisma.profile.findFirst();
  if (!profile) return null;
  const appProfile = await prisma.applicationProfile.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id },
    update: {},
  });
  return appProfile;
}

async function saveDefaults(appProfileId: string, defaults: PinnedQuestion[]) {
  await prisma.applicationProfile.update({
    where: { id: appProfileId },
    data: { customDefaults: JSON.stringify(defaults) },
  });
}

/**
 * POST: Pin a new answer (appends as alternative if question already exists).
 */
export async function POST(request: NextRequest) {
  try {
    const { question, answer } = await request.json();

    if (!question || !answer) {
      return NextResponse.json({ error: "question and answer are required" }, { status: 400 });
    }

    const appProfile = await getAppProfile();
    if (!appProfile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const defaults = upgradeDefaults(safeJsonParse(appProfile.customDefaults, []) as unknown[]);
    const norm = normalize(question);
    const existing = defaults.find((d) => normalize(d.question) === norm);

    if (existing) {
      // Skip if this exact answer text is already pinned
      const normAnswer = answer.toLowerCase().trim();
      const isDupe = existing.answers.some((a) => a.text.toLowerCase().trim() === normAnswer);
      if (isDupe) {
        return NextResponse.json({ pinned: true, duplicate: true, totalDefaults: defaults.length });
      }
      // Append as new alternative (don't replace)
      existing.answers.push({ text: answer });
    } else {
      defaults.push({ question, answers: [{ text: answer }], activeIndex: 0 });
    }

    await saveDefaults(appProfile.id, defaults);
    return NextResponse.json({ pinned: true, totalDefaults: defaults.length });
  } catch (error) {
    console.error("Pin answer error:", error);
    return NextResponse.json({ error: "Failed to pin answer" }, { status: 500 });
  }
}

/**
 * DELETE: Unpin a question entirely, or remove a single alternative by answerIndex.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { question, answerIndex } = await request.json();

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const appProfile = await getAppProfile();
    if (!appProfile?.customDefaults) {
      return NextResponse.json({ unpinned: true, totalDefaults: 0 });
    }

    let defaults = upgradeDefaults(safeJsonParse(appProfile.customDefaults, []) as unknown[]);
    const norm = normalize(question);

    if (answerIndex != null && typeof answerIndex === "number") {
      // Remove a single alternative
      const entry = defaults.find((d) => normalize(d.question) === norm);
      if (entry) {
        entry.answers.splice(answerIndex, 1);
        if (entry.answers.length === 0) {
          defaults = defaults.filter((d) => normalize(d.question) !== norm);
        } else {
          // Adjust activeIndex if needed
          if (answerIndex < entry.activeIndex) {
            entry.activeIndex--;
          } else if (answerIndex === entry.activeIndex) {
            entry.activeIndex = Math.min(entry.activeIndex, entry.answers.length - 1);
          }
        }
      }
    } else {
      // Remove entire question
      defaults = defaults.filter((d) => normalize(d.question) !== norm);
    }

    await saveDefaults(appProfile.id, defaults);
    return NextResponse.json({ unpinned: true, totalDefaults: defaults.length });
  } catch (error) {
    console.error("Unpin answer error:", error);
    return NextResponse.json({ error: "Failed to unpin answer" }, { status: 500 });
  }
}

/**
 * PATCH: Edit a pinned answer's text/label, or set it as the active answer.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { question, answerIndex, text, label, setActive } = await request.json();

    if (!question || answerIndex == null || typeof answerIndex !== "number") {
      return NextResponse.json({ error: "question and answerIndex are required" }, { status: 400 });
    }

    const appProfile = await getAppProfile();
    if (!appProfile?.customDefaults) {
      return NextResponse.json({ error: "No pinned answers found" }, { status: 404 });
    }

    const defaults = upgradeDefaults(safeJsonParse(appProfile.customDefaults, []) as unknown[]);
    const norm = normalize(question);
    const entry = defaults.find((d) => normalize(d.question) === norm);

    if (!entry || answerIndex < 0 || answerIndex >= entry.answers.length) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    if (text != null) entry.answers[answerIndex].text = text;
    if (label != null) entry.answers[answerIndex].label = label || undefined;
    if (setActive) entry.activeIndex = answerIndex;

    await saveDefaults(appProfile.id, defaults);
    return NextResponse.json({ updated: true, entry });
  } catch (error) {
    console.error("Patch pinned answer error:", error);
    return NextResponse.json({ error: "Failed to update answer" }, { status: 500 });
  }
}
