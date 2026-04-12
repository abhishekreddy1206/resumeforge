/**
 * Utilities for form-answerer: question classification and profile projection.
 * Conservative approach: only "factual" questions get a projected (smaller) profile.
 * Everything else gets the full profile — zero regression risk.
 */

export type QuestionType = "factual" | "default";

/**
 * Classify a screening question to determine how much profile data is needed.
 * Only clearly factual/metadata questions are classified as "factual".
 * Behavioral, motivation, and ambiguous questions get "default" (full profile).
 */
export function classifyQuestion(question: string): QuestionType {
  const q = question.toLowerCase();

  // Work authorization / sponsorship / citizenship
  if (/\b(authorized|eligible|legally|right to work|work.?(?:permit|visa|authorization)|sponsor|citizenship|citizen|green.?card|permanent.?residen)/i.test(q)) {
    return "factual";
  }

  // Relocation / remote preference / work mode
  if (/\b(willing.{0,6}relocat|open.{0,6}relocat|relocat.{0,6}willing|remote|hybrid|on.?site|work.?(?:mode|arrangement|preference))\b/i.test(q)) {
    return "factual";
  }

  // Salary / compensation
  if (/\b(salary|compensation|pay.?(?:expect|range|rate)|desired.?(?:salary|pay|comp))\b/i.test(q)) {
    return "factual";
  }

  // Age verification
  if (/\b(over.?18|at.?least.?18|18.?years|legal.?age)\b/i.test(q)) {
    return "factual";
  }

  // Start date / notice period
  if (/\b(notice.?period|(?:when|earliest|soonest).{0,6}(?:can.?you.?)?start|start.?date|availab.{0,6}start)\b/i.test(q)) {
    return "factual";
  }

  return "default";
}

/**
 * Project profile fields based on question type.
 * "factual" questions only need metadata — no experience bullets, no publications, etc.
 * "default" returns the full profile unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function projectProfileForQuestion(profile: Record<string, any>, type: QuestionType): Record<string, any> {
  if (type === "default") return profile;

  // For factual questions: minimal profile — just metadata needed to answer
  return {
    name: profile.name,
    location: profile.location,
    summary: profile.summary,
    // Skills as names only (no categories needed for factual answers)
    skills: (profile.skills || []).map((s: { name: string }) => s.name),
    // Experience titles + dates only (no bullets, no per-experience skills)
    experiences: (profile.experiences || []).map((e: Record<string, unknown>) => ({
      title: e.title,
      company: e.company,
      startDate: e.startDate,
      endDate: e.endDate,
      current: e.current,
    })),
  };
}
