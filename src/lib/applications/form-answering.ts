export type FormFieldCategory =
  | "sensitive_demographic"
  | "deterministic_profile"
  | "general_screening";

export type UnresolvedReason =
  | "missing_profile_value"
  | "sensitive_unset"
  | "option_mismatch"
  | "unsupported_field";

export interface FormAnswerResolved {
  answer: string;
  source: string;
  reason?: undefined;
}

export interface FormAnswerUnresolved {
  answer: null;
  source: null;
  reason: UnresolvedReason;
}

export type FormAnswerResult = FormAnswerResolved | FormAnswerUnresolved;

export interface ExplicitAnswerContext {
  firstName?: string | null;
  lastName?: string | null;
  preferredFirstName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  country?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
  twitter?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  totalYears?: number | null;
  workAuthorized?: boolean | null;
  sponsorshipNeeded?: boolean | null;
  willingToRelocate?: string | null;
  noticePeriod?: string | null;
  earliestStartDate?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  preferredWorkMode?: string | null;
  over18?: boolean | null;
  heardAboutDefault?: string | null;
  gender?: string | null;
  race?: string | null;
  veteranStatus?: string | null;
  disabilityStatus?: string | null;
}

export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[''""]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const SENSITIVE_PATTERNS = [
  /\b(gender|sex)\b/i,
  /\b(race|ethnicity|ethnic)\b/i,
  /\b(veteran|military)\b/i,
  /\b(disability|disabled|handicap)\b/i,
  /\b(sexual orientation|orientation)\b/i,
  /\b(pronoun|pronouns)\b/i,
];

const DETERMINISTIC_PATTERNS = [
  /\bpreferred(?:\s+first)?\s+name\b/i,
  /\b(first|given)\s+name\b/i,
  /\b(last|family|sur)\s*name\b/i,
  /\b(linked\s*in|linkedin|github|website|portfolio|homepage|twitter|x profile)\b/i,
  /\b(e-?mail|email|phone|mobile|cell|contact number)\b/i,
  /\b(country(?:\/region)?|country of residence|country)\b/i,
  /\b(city|location|address)\b/i,
  /\b(years?.{0,8}experience|total experience|how many years)\b/i,
  /\b(current.{0,6}(title|position|role|company|employer))\b/i,
  /\b(authorized to work|legally authorized|eligible to work|right to work|work authorization)\b/i,
  /\b(sponsor|visa status|visa|immigration)\b/i,
  /\b(relocat|willing to move)\b/i,
  /\b(notice period|earliest start|soonest start|start date|availability)\b/i,
  /\b(salary|compensation|pay expectation|desired salary)\b/i,
  /\b(remote|hybrid|on-site|onsite|work mode|work arrangement|work preference)\b/i,
  /\b(over 18|at least 18|18 years|legal age)\b/i,
  /\b(how did you hear|hear about|referral source|where did you find)\b/i,
];

const ANSWER_SYNONYMS: Record<string, string[]> = {
  male: ["man"],
  female: ["woman"],
  non_binary: ["non-binary", "non binary", "third gender"],
  prefer_not_to_say: [
    "prefer not to say",
    "prefer not to answer",
    "i don't wish to answer",
    "do not wish to answer",
    "decline to answer",
  ],
  onsite: ["on-site", "on site"],
  any: ["no preference", "open to any"],
  true: ["yes"],
  false: ["no"],
  yes: ["true"],
  no: ["false"],
};

export function classifyFormQuestion(question: string): FormFieldCategory {
  const normalized = normalizeQuestion(question);

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "sensitive_demographic";
  }
  if (DETERMINISTIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "deterministic_profile";
  }
  return "general_screening";
}

function candidateAnswers(answer: string): string[] {
  const normalized = answer.toLowerCase().trim();
  const candidates = new Set([normalized]);
  for (const synonym of ANSWER_SYNONYMS[normalized] || []) {
    candidates.add(synonym);
  }
  return [...candidates];
}

export function matchAnswerToOption(answer: string, options: string[]): string {
  return matchAnswerToOptionOrNull(answer, options) ?? answer;
}

export function matchAnswerToOptionOrNull(answer: string, options: string[]): string | null {
  if (!options.length) return answer;

  const candidates = candidateAnswers(answer);
  const normalizedOptions = options.map((option) => ({
    raw: option,
    normalized: option.toLowerCase().trim(),
  }));

  for (const candidate of candidates) {
    const exact = normalizedOptions.find((option) => option.normalized === candidate);
    if (exact) return exact.raw;
  }

  for (const candidate of candidates) {
    if (candidate.length < 3) continue;
    const startsWith = normalizedOptions.find((option) => {
      return option.normalized.startsWith(candidate) || candidate.startsWith(option.normalized);
    });
    if (startsWith) return startsWith.raw;
  }

  for (const candidate of candidates) {
    const contains = normalizedOptions.find((option) => {
      if (option.normalized.includes(candidate) && candidate.length > option.normalized.length * 0.5) return true;
      if (candidate.includes(option.normalized) && option.normalized.length > candidate.length * 0.5) return true;
      return false;
    });
    if (contains) return contains.raw;
  }

  const firstWords = candidates
    .map((candidate) => candidate.split(/[\s,]+/)[0])
    .filter((candidate) => candidate.length >= 3);
  for (const firstWord of firstWords) {
    const wordMatch = normalizedOptions.find((option) => option.normalized.split(/[\s,]+/)[0] === firstWord);
    if (wordMatch) return wordMatch.raw;
  }

  return null;
}

function salaryRange(ctx: ExplicitAnswerContext): string | null {
  if (ctx.salaryMin == null) return null;
  if (ctx.salaryMax != null) {
    return `$${ctx.salaryMin.toLocaleString()} - $${ctx.salaryMax.toLocaleString()}`;
  }
  return `$${ctx.salaryMin.toLocaleString()}`;
}

export function getExplicitAnswerForQuestion(
  question: string,
  ctx: ExplicitAnswerContext
): string | null | undefined {
  const normalized = normalizeQuestion(question);

  const lookups: Array<{ pattern: RegExp; value: string | null | undefined }> = [
    { pattern: /\bpreferred(?:\s+first)?\s+name\b/i, value: ctx.preferredFirstName ?? ctx.firstName ?? null },
    { pattern: /\b(first|given)\s+name\b/i, value: ctx.firstName ?? null },
    { pattern: /\b(last|family|sur)\s*name\b/i, value: ctx.lastName ?? null },
    { pattern: /\blinkedin|linked\s*in\b/i, value: ctx.linkedin ?? null },
    { pattern: /\bgithub\b/i, value: ctx.github ?? null },
    { pattern: /\bwebsite|portfolio|homepage\b/i, value: ctx.website ?? null },
    { pattern: /\btwitter|x profile\b/i, value: ctx.twitter ?? null },
    { pattern: /\bphone|mobile|cell|contact number\b/i, value: ctx.phone ?? null },
    { pattern: /\bemail|e-?mail\b/i, value: ctx.email ?? null },
    { pattern: /\bcountry(?:\/region)?|country of residence|country\b/i, value: ctx.country ?? null },
    { pattern: /\bcity|location|address\b/i, value: ctx.location ?? null },
    { pattern: /\byears?.{0,8}experience|total experience|how many years\b/i, value: ctx.totalYears != null ? String(ctx.totalYears) : null },
    { pattern: /\bcurrent.{0,6}(title|position|role)\b/i, value: ctx.currentTitle ?? null },
    { pattern: /\bcurrent.{0,6}(company|employer)\b/i, value: ctx.currentCompany ?? null },
    {
      pattern: /\bauthorized to work|legally authorized|eligible to work|right to work|work authorization\b/i,
      value: ctx.workAuthorized != null ? (ctx.workAuthorized ? "Yes" : "No") : null,
    },
    {
      pattern: /\bsponsor|visa status|visa|immigration\b/i,
      value: ctx.sponsorshipNeeded != null ? (ctx.sponsorshipNeeded ? "Yes" : "No") : null,
    },
    { pattern: /\brelocat|willing to move\b/i, value: ctx.willingToRelocate ?? null },
    { pattern: /\bnotice period\b/i, value: ctx.noticePeriod ?? null },
    {
      pattern: /\bearliest start|soonest start|start date|availability\b/i,
      value: ctx.earliestStartDate ?? ctx.noticePeriod ?? null,
    },
    { pattern: /\bsalary|compensation|pay expectation|desired salary\b/i, value: salaryRange(ctx) },
    { pattern: /\bremote|hybrid|on-site|onsite|work mode|work arrangement|work preference\b/i, value: ctx.preferredWorkMode ?? null },
    {
      pattern: /\bover 18|at least 18|18 years|legal age\b/i,
      value: ctx.over18 != null ? (ctx.over18 ? "Yes" : "No") : null,
    },
    {
      pattern: /\bhow did you hear|hear about|referral source|where did you find\b/i,
      value: ctx.heardAboutDefault ?? null,
    },
    { pattern: /\bgender|sex\b/i, value: ctx.gender ?? null },
    { pattern: /\brace|ethnicity|ethnic\b/i, value: ctx.race ?? null },
    { pattern: /\bveteran|military\b/i, value: ctx.veteranStatus ?? null },
    { pattern: /\bdisability|disabled|handicap\b/i, value: ctx.disabilityStatus ?? null },
    { pattern: /\bsexual orientation|orientation\b/i, value: null },
    { pattern: /\bpronoun|pronouns\b/i, value: null },
  ];

  const match = lookups.find((entry) => entry.pattern.test(normalized));
  return match ? match.value : undefined;
}

export function unresolved(reason: UnresolvedReason): FormAnswerUnresolved {
  return { answer: null, source: null, reason };
}
