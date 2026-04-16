import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateFormAnswer } from "@/lib/claude";
import {
  classifyFormQuestion,
  getExplicitAnswerForQuestion,
  matchAnswerToOptionOrNull,
  normalizeQuestion,
  unresolved,
} from "@/lib/applications/form-answering";
import { serializeProfile } from "@/lib/utils/profile-diff";

function calculateTotalYears(
  experiences: Array<{ startDate: string; endDate: string | null; current: boolean }>
): number {
  if (experiences.length === 0) return 0;
  const dates = experiences.map((e) => {
    const start = new Date(e.startDate).getTime();
    const end = e.current || !e.endDate ? Date.now() : new Date(e.endDate).getTime();
    return { start, end };
  });
  dates.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const d of dates) {
    const last = merged[merged.length - 1];
    if (last && d.start <= last.end) {
      last.end = Math.max(last.end, d.end);
    } else {
      merged.push({ ...d });
    }
  }
  const totalMs = merged.reduce((sum, r) => sum + (r.end - r.start), 0);
  return Math.round(totalMs / (1000 * 60 * 60 * 24 * 365.25));
}

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

interface FullProfileRecord {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
  twitter: string | null;
  experiences: Array<{
    current: boolean;
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
  }>;
  applicationProfile: {
    firstName: string | null;
    lastName: string | null;
    preferredFirstName: string | null;
    country: string | null;
    workAuthorized: boolean | null;
    sponsorshipNeeded: boolean | null;
    willingToRelocate: string | null;
    noticePeriod: string | null;
    earliestStartDate: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    preferredWorkMode: string | null;
    over18: boolean;
    heardAboutDefault: string | null;
    gender: string | null;
    race: string | null;
    veteranStatus: string | null;
    disabilityStatus: string | null;
  } | null;
}

function buildExplicitAnswerContext(fullProfile: FullProfileRecord) {
  const currentExp = fullProfile?.experiences.find((e) => e.current) || fullProfile?.experiences[0];
  const ap = fullProfile?.applicationProfile;

  return {
    firstName: ap?.firstName ?? fullProfile?.name.trim().split(/\s+/)[0] ?? null,
    lastName: ap?.lastName ?? (() => {
      const parts = fullProfile?.name.trim().split(/\s+/) || [];
      return parts.length > 1 ? parts.slice(1).join(" ") : null;
    })(),
    preferredFirstName: ap?.preferredFirstName ?? ap?.firstName ?? fullProfile?.name.trim().split(/\s+/)[0] ?? null,
    email: fullProfile?.email ?? null,
    phone: fullProfile?.phone ?? null,
    location: fullProfile?.location ?? null,
    country: ap?.country ?? null,
    linkedin: fullProfile?.linkedin ?? null,
    github: fullProfile?.github ?? null,
    website: fullProfile?.website ?? null,
    twitter: fullProfile?.twitter ?? null,
    currentTitle: currentExp?.title ?? null,
    currentCompany: currentExp?.company ?? null,
    totalYears: fullProfile ? calculateTotalYears(fullProfile.experiences) : null,
    workAuthorized: ap?.workAuthorized ?? null,
    sponsorshipNeeded: ap?.sponsorshipNeeded ?? null,
    willingToRelocate: ap?.willingToRelocate ?? null,
    noticePeriod: ap?.noticePeriod ?? null,
    earliestStartDate: ap?.earliestStartDate ?? null,
    salaryMin: ap?.salaryMin ?? null,
    salaryMax: ap?.salaryMax ?? null,
    preferredWorkMode: ap?.preferredWorkMode ?? null,
    over18: ap?.over18 ?? null,
    heardAboutDefault: ap?.heardAboutDefault ?? null,
    gender: ap?.gender ?? null,
    race: ap?.race ?? null,
    veteranStatus: ap?.veteranStatus ?? null,
    disabilityStatus: ap?.disabilityStatus ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { jobId, question, characterLimit, options: rawOptions } = await request.json();
    const options: string[] = Array.isArray(rawOptions) ? rawOptions.filter((o: unknown) => typeof o === "string" && o.trim()) : [];
    const category = classifyFormQuestion(question);

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    if (category !== "general_screening") {
      const fullProfile = await prisma.profile.findFirst({
        include: {
          experiences: { orderBy: { startDate: "desc" } },
          educations: true,
          projects: true,
          skills: true,
          publications: true,
          certifications: true,
          applicationProfile: true,
        },
      });

      if (!fullProfile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
      }

      const explicitAnswer = getExplicitAnswerForQuestion(
        question,
        buildExplicitAnswerContext(fullProfile)
      );

      if (explicitAnswer === undefined) {
        return NextResponse.json(unresolved("unsupported_field"));
      }
      if (!explicitAnswer) {
        return NextResponse.json(
          unresolved(category === "sensitive_demographic" ? "sensitive_unset" : "missing_profile_value")
        );
      }

      const matchedAnswer = options.length
        ? matchAnswerToOptionOrNull(explicitAnswer, options)
        : explicitAnswer;

      if (!matchedAnswer) {
        return NextResponse.json(unresolved("option_mismatch"));
      }

      return NextResponse.json({ answer: matchedAnswer, source: "profile" });
    }

    // ── Tier 1: Check per-job cache ──
    const cached = await prisma.applicationAnswer.findUnique({
      where: { jobId_question: { jobId, question } },
    });
    if (cached) {
      const answer = options.length ? matchAnswerToOptionOrNull(cached.answer, options) : cached.answer;
      if (answer) {
        return NextResponse.json({ answer, source: cached.source });
      }
    }

    // ── Tier 2: Check learned answers ──
    const normalized = normalizeQuestion(question);
    const learnedAnswers = await prisma.learnedAnswer.findMany({
      where: { normalizedQ: normalized },
      orderBy: [{ confidence: "desc" }, { lastUsedAt: "desc" }],
      take: 1,
    });
    if (learnedAnswers.length > 0) {
      const best = learnedAnswers[0];
      const answer = options.length ? matchAnswerToOptionOrNull(best.answer, options) : best.answer;
      if (answer) {
        await prisma.applicationAnswer.create({
          data: { jobId, question, answer, source: "learned" },
        });
        return NextResponse.json({ answer, source: "learned" });
      }
    }

    // ── Tier 3: Check cross-job answers (same question, different job) ──
    const allAnswers = await prisma.applicationAnswer.findMany({
      where: { NOT: { jobId } },
      select: { question: true, answer: true, source: true },
    });
    const crossJobMatch = allAnswers.find(
      (a) => normalizeQuestion(a.question) === normalized
    );
    if (crossJobMatch) {
      const answer = options.length ? matchAnswerToOptionOrNull(crossJobMatch.answer, options) : crossJobMatch.answer;
      if (answer) {
        await prisma.applicationAnswer.create({
          data: { jobId, question, answer, source: "reused" },
        });
        return NextResponse.json({ answer, source: "reused" });
      }
    }

    const [job, fullProfile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
      prisma.profile.findFirst({
        include: {
          experiences: { orderBy: { startDate: "desc" } },
          educations: true,
          projects: true,
          skills: true,
          publications: true,
          certifications: true,
          applicationProfile: true,
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
        model: undefined, // Let skill use its Haiku default
        availableOptions: options.length > 0 ? options : undefined,
      }
    );

    const finalAnswer = options.length ? matchAnswerToOptionOrNull(result.answer, options) : result.answer;

    if (!finalAnswer) {
      return NextResponse.json(unresolved("option_mismatch"));
    }

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
