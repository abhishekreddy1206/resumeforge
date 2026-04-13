import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateFormAnswer, generateFormAnswerBatch } from "@/lib/claude";
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

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[''""]/g, "'").replace(/\s+/g, " ").trim();
}

function matchAnswerToOption(answer: string, options: string[]): string {
  if (!options.length) return answer;
  const lower = answer.toLowerCase().trim();

  // Pass 1: exact match
  const exact = options.find((o) => o.toLowerCase().trim() === lower);
  if (exact) return exact;

  // Pass 2: starts-with (either direction, min 3 chars to avoid false matches)
  if (lower.length >= 3) {
    const startsWith = options.find((o) => {
      const ol = o.toLowerCase().trim();
      return ol.startsWith(lower) || lower.startsWith(ol);
    });
    if (startsWith) return startsWith;
  }

  // Pass 3: contains — only if the shorter string is >50% of the longer (avoids false positives)
  const containsMatch = options.find((o) => {
    const ol = o.toLowerCase().trim();
    if (ol.includes(lower) && lower.length > ol.length * 0.5) return true;
    if (lower.includes(ol) && ol.length > lower.length * 0.5) return true;
    return false;
  });
  if (containsMatch) return containsMatch;

  // Pass 4: word-boundary boolean matching
  const yesValues = ["true", "yes", "1", "y"];
  const noValues = ["false", "no", "0", "n"];
  if (yesValues.includes(lower)) {
    const yesOption = options.find((o) => /^yes\b/i.test(o.trim()));
    if (yesOption) return yesOption;
  }
  if (noValues.includes(lower)) {
    const noOption = options.find((o) => /^no\b/i.test(o.trim()));
    if (noOption) return noOption;
  }

  // Pass 5: first significant word match (min 3 chars)
  const firstWord = lower.split(/[\s,]+/)[0];
  if (firstWord && firstWord.length >= 3) {
    const wordMatch = options.find((o) => o.toLowerCase().trim().split(/[\s,]+/)[0] === firstWord);
    if (wordMatch) return wordMatch;
  }

  return answer;
}

interface QuestionInput {
  question: string;
  characterLimit?: number;
  options?: string[];
}

interface AnswerResult {
  answer: string;
  source: string;
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

    const currentExp = fullProfile.experiences.find((e) => e.current) || fullProfile.experiences[0];
    const appProfile = fullProfile.applicationProfile;
    const profileLookups: Array<{ pattern: RegExp; value: string | null }> = [
      { pattern: /linkedin/i, value: fullProfile.linkedin },
      { pattern: /github/i, value: fullProfile.github },
      { pattern: /website|portfolio/i, value: fullProfile.website },
      { pattern: /twitter/i, value: fullProfile.twitter },
      { pattern: /phone|mobile|cell/i, value: fullProfile.phone },
      { pattern: /e-?mail/i, value: fullProfile.email },
      { pattern: /city|location/i, value: fullProfile.location },
      { pattern: /years?.{0,3}(?:of.?)?experience/i, value: String(calculateTotalYears(fullProfile.experiences)) },
      { pattern: /current.{0,3}(?:title|position|role)/i, value: currentExp?.title ?? null },
      { pattern: /current.{0,3}(?:company|employer)/i, value: currentExp?.company ?? null },
      // ApplicationProfile fields
      { pattern: /authorized.?to.?work|legally.?(?:authorized|eligible)|right.?to.?work|eligible.?to.?work|work.?authorization/i, value: appProfile?.workAuthorized != null ? (appProfile.workAuthorized ? "Yes" : "No") : null },
      { pattern: /sponsor|visa|immigration/i, value: appProfile?.sponsorshipNeeded != null ? (appProfile.sponsorshipNeeded ? "Yes" : "No") : null },
      { pattern: /relocat/i, value: appProfile?.willingToRelocate ?? null },
      { pattern: /notice.?period/i, value: appProfile?.noticePeriod ?? null },
      { pattern: /(?:when|earliest|soonest).{0,6}(?:can.?you.?)?start|start.?date|availability/i, value: appProfile?.earliestStartDate ?? null },
      { pattern: /salary|compensation|pay.?expect/i, value: appProfile?.salaryMin != null ? (appProfile.salaryMax ? `$${appProfile.salaryMin.toLocaleString()} - $${appProfile.salaryMax.toLocaleString()}` : `$${appProfile.salaryMin.toLocaleString()}`) : null },
      { pattern: /remote|hybrid|on.?site|work.?(?:mode|arrangement|preference|style)/i, value: appProfile?.preferredWorkMode ?? null },
      { pattern: /over.?18|at.?least.?18|18.?years|legal.?age|are.?you.?18/i, value: appProfile?.over18 != null ? (appProfile.over18 ? "Yes" : "No") : null },
      { pattern: /how.?did.?you.?(?:hear|find|learn)|hear.?about|referral.?source|where.?did.?you.?find/i, value: appProfile?.heardAboutDefault ?? null },
      { pattern: /visa.?status|immigration.?status/i, value: appProfile?.sponsorshipNeeded != null ? (appProfile.sponsorshipNeeded ? "Requires sponsorship" : "No sponsorship needed") : null },
      { pattern: /country/i, value: fullProfile.location ? fullProfile.location.split(",").pop()?.trim() || null : null },
    ];

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
    const results: AnswerResult[] = [];
    const toGenerate: Array<{ index: number; input: QuestionInput }> = [];

    for (let i = 0; i < questions.length; i++) {
      const input = questions[i] as QuestionInput;
      const q = input.question;
      const opts: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
      const norm = normalizeQuestion(q);
      let resolved = false;

      // Tier 1: Per-job cache
      const cached = cachedMap.get(norm);
      if (cached) {
        const answer = opts.length ? matchAnswerToOption(cached.answer, opts) : cached.answer;
        results[i] = { answer, source: cached.source };
        resolved = true;
      }

      // Tier 2: Learned answers
      if (!resolved) {
        const learned = learnedMap.get(norm);
        if (learned && learned.length > 0) {
          const best = learned[0];
          let answer: string | null = best.answer;
          if (opts.length > 0) {
            const matched = matchAnswerToOption(answer, opts);
            const isRealMatch = opts.some((o) => o.toLowerCase().trim() === matched.toLowerCase().trim());
            if (!isRealMatch) answer = null;
            else answer = matched;
          }
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
          const answer = opts.length ? matchAnswerToOption(crossMatch.answer, opts) : crossMatch.answer;
          await prisma.applicationAnswer.create({
            data: { jobId, question: q, answer, source: "reused" },
          });
          results[i] = { answer, source: "reused" };
          resolved = true;
        }
      }

      // Tier 3.5: Profile data lookup
      if (!resolved) {
        for (const lookup of profileLookups) {
          if (lookup.pattern.test(q) && lookup.value) {
            const answer = opts.length ? matchAnswerToOption(lookup.value, opts) : lookup.value;
            await prisma.applicationAnswer.create({
              data: { jobId, question: q, answer, source: "profile" },
            });
            results[i] = { answer, source: "profile" };
            resolved = true;
            break;
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
              const opts: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
              return {
                question: input.question,
                characterLimit: input.characterLimit ? Number(input.characterLimit) : undefined,
                availableOptions: opts.length > 0 ? opts : undefined,
              };
            }),
          );

          if (Array.isArray(batchResults) && batchResults.length === toGenerate.length) {
            for (let j = 0; j < toGenerate.length; j++) {
              const { index, input } = toGenerate[j];
              const opts: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
              const raw = batchResults[j]?.answer || "";
              const finalAnswer = opts.length ? matchAnswerToOption(raw, opts) : raw;
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
            const opts: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];
            return generateFormAnswer(
              profileData as Record<string, unknown>,
              jobAnalysis,
              input.question,
              {
                characterLimit: input.characterLimit ? Number(input.characterLimit) : undefined,
                model: undefined, // Let skill use its Haiku default
                availableOptions: opts.length > 0 ? opts : undefined,
              }
            );
          })
        );

        for (let j = 0; j < toGenerate.length; j++) {
          const { index, input } = toGenerate[j];
          const result = aiResults[j];
          const opts: string[] = Array.isArray(input.options) ? input.options.filter(Boolean) : [];

          if (result.status === "fulfilled") {
            const finalAnswer = opts.length ? matchAnswerToOption(result.value.answer, opts) : result.value.answer;
            await prisma.applicationAnswer.create({
              data: { jobId, question: input.question, answer: finalAnswer, source: "ai" },
            });
            results[index] = { answer: finalAnswer, source: "ai" };
          } else {
            results[index] = { answer: "", source: "error" };
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
