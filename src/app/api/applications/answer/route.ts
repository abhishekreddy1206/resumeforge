import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateFormAnswer } from "@/lib/claude";
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
        const defaults = safeJsonParse(appProfile.customDefaults, []) as Array<Record<string, unknown>>;
        const normalized = normalizeQuestion(question);
        const pinned = defaults.find((d) => normalizeQuestion(String(d.question || "")) === normalized);
        if (pinned) {
          // Support both old { question, answer } and new { question, answers[], activeIndex } shapes
          let activeText: string | null = null;
          if ("answers" in pinned && Array.isArray(pinned.answers)) {
            const idx = typeof pinned.activeIndex === "number" ? pinned.activeIndex : 0;
            const entry = (pinned.answers as Array<{ text: string }>)[idx];
            activeText = entry?.text ?? null;
          } else if (typeof pinned.answer === "string") {
            activeText = pinned.answer;
          }
          if (activeText) {
            const answer = options.length ? matchAnswerToOption(activeText, options) : activeText;
            await prisma.applicationAnswer.create({
              data: { jobId, question, answer, source: "pinned" },
            });
            return NextResponse.json({ answer, source: "pinned" });
          }
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

    // ── Tier 3.5: Profile data lookup (exact values) ──
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

    const currentExp = fullProfile.experiences.find((e) => e.current) || fullProfile.experiences[0];
    const ap = fullProfile.applicationProfile;
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
      { pattern: /authorized.?to.?work|legally.?(?:authorized|eligible)|right.?to.?work|eligible.?to.?work|work.?authorization/i, value: ap?.workAuthorized != null ? (ap.workAuthorized ? "Yes" : "No") : null },
      { pattern: /sponsor|visa|immigration/i, value: ap?.sponsorshipNeeded != null ? (ap.sponsorshipNeeded ? "Yes" : "No") : null },
      { pattern: /relocat/i, value: ap?.willingToRelocate ?? null },
      { pattern: /notice.?period/i, value: ap?.noticePeriod ?? null },
      { pattern: /(?:when|earliest|soonest).{0,6}(?:can.?you.?)?start|start.?date|availability/i, value: ap?.earliestStartDate ?? null },
      { pattern: /salary|compensation|pay.?expect/i, value: ap?.salaryMin != null ? (ap.salaryMax ? `$${ap.salaryMin.toLocaleString()} - $${ap.salaryMax.toLocaleString()}` : `$${ap.salaryMin.toLocaleString()}`) : null },
      { pattern: /remote|hybrid|on.?site|work.?(?:mode|arrangement|preference|style)/i, value: ap?.preferredWorkMode ?? null },
      { pattern: /over.?18|at.?least.?18|18.?years|legal.?age|are.?you.?18/i, value: ap?.over18 != null ? (ap.over18 ? "Yes" : "No") : null },
      { pattern: /how.?did.?you.?(?:hear|find|learn)|hear.?about|referral.?source|where.?did.?you.?find/i, value: ap?.heardAboutDefault ?? null },
    ];

    for (const lookup of profileLookups) {
      if (lookup.pattern.test(question) && lookup.value) {
        const answer = options.length ? matchAnswerToOption(lookup.value, options) : lookup.value;
        await prisma.applicationAnswer.create({
          data: { jobId, question, answer, source: "profile" },
        });
        return NextResponse.json({ answer, source: "profile" });
      }
    }

    // ── Tier 4: Generate via AI ──
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
        availableOptions: options.length > 0 ? options : undefined,
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
