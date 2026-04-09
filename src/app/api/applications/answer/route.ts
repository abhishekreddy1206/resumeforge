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

export async function POST(request: NextRequest) {
  try {
    const { jobId, question, characterLimit } = await request.json();

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
      return NextResponse.json({ answer: cached.answer, source: cached.source });
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
          // Cache for this job too
          await prisma.applicationAnswer.create({
            data: { jobId, question, answer: pinned.answer, source: "pinned" },
          });
          return NextResponse.json({ answer: pinned.answer, source: "pinned" });
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
      // Cache for this job
      await prisma.applicationAnswer.create({
        data: { jobId, question, answer: crossJobMatch.answer, source: "reused" },
      });
      return NextResponse.json({ answer: crossJobMatch.answer, source: "reused" });
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

    // Cache the answer
    await prisma.applicationAnswer.create({
      data: {
        jobId,
        question,
        answer: result.answer,
        source: "ai",
      },
    });

    return NextResponse.json({ answer: result.answer, source: "ai" });
  } catch (error) {
    console.error("Form answer generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate answer" },
      { status: 500 }
    );
  }
}
