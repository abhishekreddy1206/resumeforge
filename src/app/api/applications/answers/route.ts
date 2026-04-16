import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateFormAnswer, generateFormAnswerBatch } from "@/lib/claude";
import {
  classifyFormQuestion,
  type FormAnswerResult,
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

interface QuestionInput {
  question: string;
  characterLimit?: number;
  options?: string[];
}

/**
 * POST: Batch-resolve multiple screening questions in a single request.
 * Shares expensive DB fetches across all questions.
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, questions } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "questions array is required" }, { status: 400 });
    }

    // ── Shared data fetches (once for entire batch) ──
    const [
      cachedAnswers,
      job,
      fullProfile,
      allCrossJobAnswers,
      allLearnedAnswers,
    ] = await Promise.all([
      prisma.applicationAnswer.findMany({
        where: { jobId },
        select: { question: true, answer: true, source: true },
      }),
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
      prisma.applicationAnswer.findMany({
        where: { NOT: { jobId } },
        select: { question: true, answer: true, source: true },
      }),
      prisma.learnedAnswer.findMany({
        orderBy: [{ confidence: "desc" }, { lastUsedAt: "desc" }],
      }),
    ]);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!fullProfile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    // Pre-compute shared data
    const cachedMap = new Map(cachedAnswers.map((a) => [normalizeQuestion(a.question), a]));

    const learnedMap = new Map<string, typeof allLearnedAnswers>();
    for (const la of allLearnedAnswers) {
      const list = learnedMap.get(la.normalizedQ) || [];
      list.push(la);
      learnedMap.set(la.normalizedQ, list);
    }

    const explicitAnswerContext = buildExplicitAnswerContext(fullProfile);

    const profileData = serializeProfile(fullProfile);
    const jobAnalysis = {
      title: job.title,
      company: job.company,
      skills: safeJsonParse(job.skills, []),
      requirements: safeJsonParse(job.requirements, []),
      atsKeywords: safeJsonParse(job.atsKeywords, {}),
      seniority: job.seniority,
    };

    // ── Resolve each question through the tier system ──
    const results: FormAnswerResult[] = [];
    const toGenerate: Array<{ index: number; input: QuestionInput }> = [];

    for (let i = 0; i < questions.length; i++) {
      const input = questions[i] as QuestionInput;
      const q = input.question;
      const opts: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
      const norm = normalizeQuestion(q);
      const category = classifyFormQuestion(q);
      let resolved = false;

      if (category !== "general_screening") {
        const explicitAnswer = getExplicitAnswerForQuestion(q, explicitAnswerContext);
        if (explicitAnswer === undefined) {
          results[i] = unresolved("unsupported_field");
        } else if (!explicitAnswer) {
          results[i] = unresolved(category === "sensitive_demographic" ? "sensitive_unset" : "missing_profile_value");
        } else {
          const matchedAnswer = opts.length
            ? matchAnswerToOptionOrNull(explicitAnswer, opts)
            : explicitAnswer;
          results[i] = matchedAnswer
            ? { answer: matchedAnswer, source: "profile" }
            : unresolved("option_mismatch");
        }
        resolved = true;
      }

      // Tier 1: Per-job cache
      const cached = cachedMap.get(norm);
      if (!resolved && cached) {
        const answer = opts.length ? matchAnswerToOptionOrNull(cached.answer, opts) : cached.answer;
        if (answer) {
          results[i] = { answer, source: cached.source };
          resolved = true;
        }
      }

      // Tier 2: Learned answers
      if (!resolved) {
        const learned = learnedMap.get(norm);
        if (learned && learned.length > 0) {
          const best = learned[0];
          const answer = opts.length ? matchAnswerToOptionOrNull(best.answer, opts) : best.answer;
          if (answer) {
            await prisma.applicationAnswer.create({
              data: { jobId, question: q, answer, source: "learned" },
            });
            results[i] = { answer, source: "learned" };
            resolved = true;
          }
        }
      }

      // Tier 3: Cross-job reuse
      if (!resolved) {
        const crossMatch = allCrossJobAnswers.find((a) => normalizeQuestion(a.question) === norm);
        if (crossMatch) {
          const answer = opts.length ? matchAnswerToOptionOrNull(crossMatch.answer, opts) : crossMatch.answer;
          if (answer) {
            await prisma.applicationAnswer.create({
              data: { jobId, question: q, answer, source: "reused" },
            });
            results[i] = { answer, source: "reused" };
            resolved = true;
          }
        }
      }

      // Tier 4: Queue for AI generation
      if (!resolved) {
        toGenerate.push({ index: i, input });
      }
    }

    // ── Tier 4: Generate remaining via AI ──
    // Use batch call for 2+ questions (sends profile/job once instead of N times)
    // Falls back to individual parallel calls on batch failure
    if (toGenerate.length > 0) {
      let batchOk = false;

      if (toGenerate.length >= 2) {
        try {
          const batchResults = await generateFormAnswerBatch(
            profileData as Record<string, unknown>,
            jobAnalysis,
            toGenerate.map(({ input }) => {
              const batchOptions: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
              return {
                question: input.question,
                characterLimit: input.characterLimit ? Number(input.characterLimit) : undefined,
                availableOptions: batchOptions.length > 0 ? batchOptions : undefined,
              };
            }),
          );

          if (Array.isArray(batchResults) && batchResults.length === toGenerate.length) {
            for (let j = 0; j < toGenerate.length; j++) {
              const { index, input } = toGenerate[j];
              const batchOptions: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
              const raw = batchResults[j]?.answer || "";
              const finalAnswer = batchOptions.length ? matchAnswerToOptionOrNull(raw, batchOptions) : raw;

              if (!finalAnswer) {
                results[index] = unresolved("option_mismatch");
                continue;
              }

              await prisma.applicationAnswer.create({
                data: { jobId, question: input.question, answer: finalAnswer, source: "ai" },
              });
              results[index] = { answer: finalAnswer, source: "ai" };
            }
            batchOk = true;
          }
        } catch {
          // Fall through to individual calls
        }
      }

      if (!batchOk) {
        const aiResults = await Promise.allSettled(
          toGenerate.map(({ input }) => {
            const aiOptions: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
            return generateFormAnswer(
              profileData as Record<string, unknown>,
              jobAnalysis,
              input.question,
              {
                characterLimit: input.characterLimit ? Number(input.characterLimit) : undefined,
                model: undefined, // Let skill use its Haiku default
                availableOptions: aiOptions.length > 0 ? aiOptions : undefined,
              }
            );
          })
        );

        for (let j = 0; j < toGenerate.length; j++) {
          const { index, input } = toGenerate[j];
          const result = aiResults[j];
          const aiOptions: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];

          if (result.status === "fulfilled") {
            const finalAnswer = aiOptions.length ? matchAnswerToOptionOrNull(result.value.answer, aiOptions) : result.value.answer;
            if (!finalAnswer) {
              results[index] = unresolved("option_mismatch");
              continue;
            }

            await prisma.applicationAnswer.create({
              data: { jobId, question: input.question, answer: finalAnswer, source: "ai" },
            });
            results[index] = { answer: finalAnswer, source: "ai" };
          } else {
            results[index] = unresolved("unsupported_field");
          }
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Batch answer error:", error);
    return NextResponse.json(
      { error: "Failed to generate answers" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId query parameter is required" }, { status: 400 });
    }

    const answers = await prisma.applicationAnswer.findMany({
      where: { jobId },
      select: {
        id: true,
        question: true,
        answer: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(answers);
  } catch (error) {
    console.error("Fetch answers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch answers" },
      { status: 500 }
    );
  }
}
