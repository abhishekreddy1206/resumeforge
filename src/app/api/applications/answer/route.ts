import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateFormAnswer } from "@/lib/claude";
import { serializeProfile } from "@/lib/utils/profile-diff";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Normalize question text for fuzzy matching across jobs.
 * Strips company-specific details, lowercases, collapses whitespace.
 */
function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[''""]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fuzzy-match an answer against available dropdown options.
 * Returns the best matching option text, or the original answer if no match.
 */
function matchAnswerToOption(answer: string, options: string[]): string {
  if (!options.length) return answer;
  const lower = answer.toLowerCase().trim();

  // Exact match (case-insensitive)
  const exact = options.find((o) => o.toLowerCase().trim() === lower);
  if (exact) return exact;

  // Contains match — option contains answer or answer contains option
  const contains = options.find((o) => {
    const ol = o.toLowerCase().trim();
    return ol.includes(lower) || lower.includes(ol);
  });
  if (contains) return contains;

  // Boolean mapping: true/yes/1 → first yes-like option, false/no/0 → first no-like option
  const yesValues = ["true", "yes", "1", "y"];
  const noValues = ["false", "no", "0", "n"];
  if (yesValues.includes(lower)) {
    const yesOption = options.find((o) => yesValues.includes(o.toLowerCase().trim()));
    if (yesOption) return yesOption;
  }
  if (noValues.includes(lower)) {
    const noOption = options.find((o) => noValues.includes(o.toLowerCase().trim()));
    if (noOption) return noOption;
  }

  // Starts-with match
  const startsWith = options.find((o) => o.toLowerCase().trim().startsWith(lower));
  if (startsWith) return startsWith;

  return answer;
}

export async function POST(request: NextRequest) {
  try {
    const { jobId, question, characterLimit, options: rawOptions } = await request.json();
    const options: string[] = Array.isArray(rawOptions) ? rawOptions.filter((o: unknown) => typeof o === "string" && o.trim()) : [];

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    // ── Tier 1: Check per-job cache ──
    const cached = await prisma.applicationAnswer.findUnique({
      where: { jobId_question: { jobId, question } },
    });
    if (cached) {
      const answer = options.length ? matchAnswerToOption(cached.answer, options) : cached.answer;
      return NextResponse.json({ answer, source: cached.source });
    }

    // ── Tier 2: Check pinned custom defaults ──
    const profile = await prisma.profile.findFirst();
    if (profile) {
      const appProfile = await prisma.applicationProfile.findUnique({
        where: { profileId: profile.id },
      });
      if (appProfile?.customDefaults) {
        const defaults = safeJsonParse(appProfile.customDefaults, []) as Array<{ question: string; answer: string }>;
        const normalized = normalizeQuestion(question);
        const pinned = defaults.find((d) => normalizeQuestion(d.question) === normalized);
        if (pinned) {
          const answer = options.length ? matchAnswerToOption(pinned.answer, options) : pinned.answer;
          // Cache for this job too
          await prisma.applicationAnswer.create({
            data: { jobId, question, answer, source: "pinned" },
          });
          return NextResponse.json({ answer, source: "pinned" });
        }
      }
    }

    // ── Tier 3: Check cross-job answers (same question, different job) ──
    const allAnswers = await prisma.applicationAnswer.findMany({
      where: { NOT: { jobId } },
      select: { question: true, answer: true, source: true },
    });
    const normalized = normalizeQuestion(question);
    const crossJobMatch = allAnswers.find(
      (a) => normalizeQuestion(a.question) === normalized
    );
    if (crossJobMatch) {
      const answer = options.length ? matchAnswerToOption(crossJobMatch.answer, options) : crossJobMatch.answer;
      // Cache for this job
      await prisma.applicationAnswer.create({
        data: { jobId, question, answer, source: "reused" },
      });
      return NextResponse.json({ answer, source: "reused" });
    }

    // ── Tier 4: Generate via AI ──
    const [job, fullProfile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
      prisma.profile.findFirst({
        include: {
          experiences: true,
          educations: true,
          projects: true,
          skills: true,
          publications: true,
          certifications: true,
        },
      }),
    ]);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!fullProfile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const profileData = serializeProfile(fullProfile);
    const jobAnalysis = {
      title: job.title,
      company: job.company,
      skills: safeJsonParse(job.skills, []),
      requirements: safeJsonParse(job.requirements, []),
      atsKeywords: safeJsonParse(job.atsKeywords, {}),
      seniority: job.seniority,
    };

    const result = await generateFormAnswer(
      profileData as Record<string, unknown>,
      jobAnalysis,
      question,
      {
        characterLimit: characterLimit ? Number(characterLimit) : undefined,
        model: job.aiModel,
      }
    );

    const finalAnswer = options.length ? matchAnswerToOption(result.answer, options) : result.answer;

    // Cache the answer
    await prisma.applicationAnswer.create({
      data: {
        jobId,
        question,
        answer: finalAnswer,
        source: "ai",
      },
    });

    return NextResponse.json({ answer: finalAnswer, source: "ai" });
  } catch (error) {
    console.error("Form answer generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate answer" },
      { status: 500 }
    );
  }
}
