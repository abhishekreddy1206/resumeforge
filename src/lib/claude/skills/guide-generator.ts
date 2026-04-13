import { askJson } from "../client";
import {
  GUIDE_INSTRUCTIONS, GUIDE_SCHEMA, SECTION_SCHEMA, OUTLINE_SCHEMA, truncateSource,
  SECTION_SESSION_INSTRUCTIONS,
} from "./guide-prompts";
import { createLogger } from "@/lib/logger";

const log = createLogger("guide-generator");

export type SectionGenStatus = "pending" | "generating" | "completed" | "failed" | "refining";
export type GuideGenerationState = "running" | "blocked" | "complete";

export interface GuideContentStorage extends GuideContent {
  _sectionPlan?: Array<{ id: string; title: string; scope: string }>;
  _sectionStatuses?: Record<string, SectionGenStatus>;
  _sectionErrors?: Record<string, string>;
  _sectionAttempts?: Record<string, number>;
}

export interface CodeExample {
  language: string;
  code: string;
  caption: string;
}

export interface QuizCheck {
  type: "quiz";
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface OpenEndedCheck {
  type: "open_ended";
  prompt: string;
  rubric: string;
}

export type KnowledgeCheck = QuizCheck | OpenEndedCheck;

export interface InterviewScenario {
  setup: string;
  hints: string[];
  sampleAnswer: string;
}

export interface GuideSection {
  id: string;
  title: string;
  explanation: string;
  codeExamples: CodeExample[];
  knowledgeChecks: KnowledgeCheck[];
  interviewScenarios: InterviewScenario[];
  keyTakeaways: string[];
}

export interface GuideContent {
  title: string;
  overview: string;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[];
  sections: GuideSection[];
  references: Array<{ title: string; url?: string; description: string }>;
}

export interface GuideOutline {
  title: string;
  overview: string;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[];
  sectionPlan: Array<{
    id: string;
    title: string;
    scope: string;
  }>;
  references: Array<{ title: string; url?: string; description: string }>;
}

export interface RefineResult {
  content: GuideContent;
  changeDescription: string;
}

export interface GeneratedGuideSectionResult {
  section: GuideSection;
  attempts: number;
}

export class GuideOutlineValidationError extends Error {
  attempts: number;
  issues: string[];

  constructor(issues: string[], attempts: number) {
    super(`Guide outline validation failed: ${issues.join("; ")}`);
    this.name = "GuideOutlineValidationError";
    this.attempts = attempts;
    this.issues = issues;
  }
}

export class GuideSectionValidationError extends Error {
  attempts: number;
  issues: string[];
  causeValue?: unknown;

  constructor(message: string, issues: string[], attempts: number, causeValue?: unknown) {
    super(message);
    this.name = "GuideSectionValidationError";
    this.attempts = attempts;
    this.issues = issues;
    this.causeValue = causeValue;
  }
}

export class GuideContentValidationError extends Error {
  issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "GuideContentValidationError";
    this.issues = issues;
  }
}

const MIN_SECTION_EXPLANATION_WORDS = 120;
const MIN_SECTION_KNOWLEDGE_CHECKS = 2;
const MIN_SECTION_INTERVIEW_SCENARIOS = 1;
const MIN_SECTION_KEY_TAKEAWAYS = 2;
const MAX_OUTLINE_ATTEMPTS = 2;
const DEFAULT_SECTION_ATTEMPTS = 2;
const MAX_SECTION_ATTEMPTS = 3;
const SECTION_TIMEOUT_MS = 900_000;

function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function normalizeGuideSection(
  section: Partial<GuideSection>,
  fallback: { id: string; title: string }
): GuideSection {
  return {
    id: (section.id || fallback.id || "").trim(),
    title: (section.title || fallback.title || "").trim(),
    explanation: typeof section.explanation === "string" ? section.explanation.trim() : "",
    codeExamples: Array.isArray(section.codeExamples) ? section.codeExamples : [],
    knowledgeChecks: Array.isArray(section.knowledgeChecks) ? section.knowledgeChecks : [],
    interviewScenarios: Array.isArray(section.interviewScenarios) ? section.interviewScenarios : [],
    keyTakeaways: Array.isArray(section.keyTakeaways) ? section.keyTakeaways : [],
  };
}

export function validateGuideOutline(outline: GuideOutline): string[] {
  const issues: string[] = [];
  const plan = Array.isArray(outline.sectionPlan) ? outline.sectionPlan : [];

  if (!outline.title?.trim()) {
    issues.push("missing guide title");
  }
  if (!outline.overview?.trim()) {
    issues.push("missing guide overview");
  }
  if (plan.length < 4 || plan.length > 8) {
    issues.push(`expected 4-8 sections, got ${plan.length}`);
  }

  const seenIds = new Set<string>();
  for (const [index, section] of plan.entries()) {
    const id = section.id?.trim() || "";
    const title = section.title?.trim() || "";
    const scope = section.scope?.trim() || "";
    if (!id) issues.push(`section ${index + 1} is missing an id`);
    if (!title) issues.push(`section ${index + 1} is missing a title`);
    if (!scope) issues.push(`section "${title || id || index + 1}" is missing a scope`);
    if (id) {
      if (seenIds.has(id)) {
        issues.push(`duplicate section id "${id}"`);
      }
      seenIds.add(id);
    }
  }

  return issues;
}

export function validateGuideSection(section: GuideSection): string[] {
  const issues: string[] = [];
  if (!section.id?.trim()) issues.push("missing section id");
  if (!section.title?.trim()) issues.push("missing section title");
  if (countWords(section.explanation) < MIN_SECTION_EXPLANATION_WORDS) {
    issues.push("explanation is too short");
  }
  if ((section.knowledgeChecks?.length ?? 0) < MIN_SECTION_KNOWLEDGE_CHECKS) {
    issues.push("knowledge checks are missing or incomplete");
  }
  if ((section.interviewScenarios?.length ?? 0) < MIN_SECTION_INTERVIEW_SCENARIOS) {
    issues.push("interview scenarios are missing");
  }
  if ((section.keyTakeaways?.length ?? 0) < MIN_SECTION_KEY_TAKEAWAYS) {
    issues.push("key takeaways are missing");
  }
  return issues;
}

export function validateGuideContent(content: GuideContent): string[] {
  const issues: string[] = [];
  if (!content.title?.trim()) issues.push("missing guide title");
  if (!content.overview?.trim()) issues.push("missing guide overview");
  if (!Array.isArray(content.sections) || content.sections.length < 4 || content.sections.length > 8) {
    issues.push(`expected 4-8 sections, got ${Array.isArray(content.sections) ? content.sections.length : 0}`);
    return issues;
  }

  const seenIds = new Set<string>();
  content.sections.forEach((section, index) => {
    if (seenIds.has(section.id)) {
      issues.push(`duplicate section id "${section.id}"`);
    }
    seenIds.add(section.id);
    for (const issue of validateGuideSection(section)) {
      issues.push(`section ${index + 1} (${section.title || section.id}): ${issue}`);
    }
  });

  return issues;
}

/**
 * Skill: Guide Generator
 *
 * Generates or refines structured interactive study guides.
 * Generate mode: creates a full guide from a topic + optional sources.
 * Refine mode: enhances an existing guide with new source material.
 */
export async function generateGuide(
  topic: string,
  options?: { sources?: string[]; difficulty?: string; model?: string }
): Promise<GuideContent> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL:\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${truncateSource(s, 8000)}`).join("\n\n")}`
    : "";
  const difficultyHint = options?.difficulty ? `\nTarget difficulty: ${options.difficulty}` : "";

  const guide = await askJson<GuideContent>(`${GUIDE_INSTRUCTIONS}

TOPIC: ${topic}${difficultyHint}${sourceBlock}

Return ONLY valid JSON matching this structure:
${GUIDE_SCHEMA}`, { timeoutMs: 1_200_000, skill: "guide-generator", model: options?.model });
  const issues = validateGuideContent(guide);
  if (issues.length > 0) {
    throw new GuideContentValidationError(`Generated guide "${topic}" is incomplete.`, issues);
  }
  return guide;
}

export async function refineGuide(
  existingContent: GuideContent,
  newSources: string[],
  options?: { instructions?: string; model?: string }
): Promise<RefineResult> {
  const instructionBlock = options?.instructions ? `\nUSER INSTRUCTIONS: ${options.instructions}` : "";

  // Send compressed summary instead of full guide JSON to reduce prompt size
  const existingSummary = {
    title: existingContent.title,
    overview: existingContent.overview,
    sectionCount: existingContent.sections.length,
    sections: existingContent.sections.map(s => ({
      id: s.id,
      title: s.title,
      keyTakeaways: s.keyTakeaways,
      hasCode: (s.codeExamples?.length ?? 0) > 0,
      checkCount: s.knowledgeChecks?.length ?? 0,
      scenarioCount: s.interviewScenarios?.length ?? 0,
    })),
  };

  const result = await askJson<RefineResult>(`${GUIDE_INSTRUCTIONS}

REFINE EXISTING GUIDE:
${JSON.stringify(existingSummary)}

NEW SOURCE MATERIAL:
${newSources.map((s, i) => `--- New Source ${i + 1} ---\n${truncateSource(s, 8000)}`).join("\n\n")}${instructionBlock}

TASK:
- Enhance existing sections with new details, examples, nuance from sources
- Add new sections if sources cover missing topics
- Add code examples, quizzes, interview scenarios from new material
- Keep existing good content. Only remove factually wrong content.
- If >60% restructure needed, regenerate entirely. State this in changeDescription.

Return ONLY valid JSON:
{
  "content": ${GUIDE_SCHEMA},
  "changeDescription": "string — summarize what changed"
}`, { timeoutMs: 1_200_000, skill: "guide-generator", model: options?.model });
  const issues = validateGuideContent(result.content);
  if (issues.length > 0) {
    throw new GuideContentValidationError("Refined guide content is incomplete.", issues);
  }
  return result;
}

/**
 * Fast outline generation (~15s). Returns the guide skeleton
 * with section titles and scopes but no content.
 */
export async function generateGuideOutline(
  topic: string,
  options?: { sources?: string[]; difficulty?: string; model?: string }
): Promise<GuideOutline> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL (inform section planning):\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${truncateSource(s, 4000)}`).join("\n\n")}`
    : "";
  const difficultyHint = options?.difficulty ? `\nTarget difficulty: ${options.difficulty}` : "";

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= MAX_OUTLINE_ATTEMPTS; attempt++) {
    const outline = await askJson<GuideOutline>(`${GUIDE_INSTRUCTIONS}

TOPIC: ${topic}${difficultyHint}${sourceBlock}

Plan 4-8 sections that progressively build understanding. Do NOT write section content — only plan structure.

Return ONLY valid JSON:
${OUTLINE_SCHEMA}`, { timeoutMs: 120_000, skill: "guide-outline", model: options?.model });

    const issues = validateGuideOutline(outline);
    if (issues.length === 0) {
      return outline;
    }
    lastIssues = issues;
    log.warn("invalid_outline", { topic, attempt, issues: issues.join("; ") });
  }

  throw new GuideOutlineValidationError(lastIssues, MAX_OUTLINE_ATTEMPTS);
}

/**
 * Generate a single validated guide section in one pass.
 */
export async function generateGuideSection(
  topic: string,
  sectionPlan: { id: string; title: string; scope: string },
  context: { difficulty: string; siblingTitles: string[] },
  options?: { sources?: string[]; model?: string; maxAttempts?: number }
): Promise<GeneratedGuideSectionResult> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL:\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${truncateSource(s, 6000)}`).join("\n\n")}`
    : "";
  const maxAttempts = Math.max(
    1,
    Math.min(options?.maxAttempts ?? DEFAULT_SECTION_ATTEMPTS, MAX_SECTION_ATTEMPTS)
  );

  const sectionContext = `
GUIDE TOPIC: ${topic}
DIFFICULTY: ${context.difficulty}
OTHER SECTIONS: ${context.siblingTitles.join(", ")}

SECTION TO WRITE:
- ID: ${sectionPlan.id}
- Title: ${sectionPlan.title}
- Scope: ${sectionPlan.scope}${sourceBlock}`;

  let lastIssues: string[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const candidate = await askJson<GuideSection>(`${SECTION_SESSION_INSTRUCTIONS}
${sectionContext}

Return ONLY valid JSON:
${SECTION_SCHEMA}`, { timeoutMs: SECTION_TIMEOUT_MS, skill: "guide-section", model: options?.model });

      const normalized = normalizeGuideSection(candidate, sectionPlan);
      const issues = validateGuideSection(normalized);
      if (issues.length === 0) {
        return {
          section: normalized,
          attempts: attempt,
        };
      }

      lastIssues = issues;
      log.warn("invalid_section", { sectionTitle: sectionPlan.title, attempt, issues: issues.join("; ") });
    } catch (error) {
      lastError = error;
      log.warn("section_generation_attempt_failed", { sectionTitle: sectionPlan.title, attempt, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  throw new GuideSectionValidationError(
    `Could not generate a complete interactive section for "${sectionPlan.title}".`,
    lastIssues.length > 0 ? lastIssues : ["section generation failed"],
    maxAttempts,
    lastError
  );
}

/**
 * Refine a single section with new source material.
 * Cheaper than full-guide refine (~$0.10-0.30 vs $2-5).
 */
export async function refineGuideSection(
  topic: string,
  existingSection: GuideSection,
  newSources: string[],
  context: { difficulty: string; siblingTitles: string[] },
  options?: { instructions?: string; model?: string }
): Promise<GuideSection> {
  const sourceBlock = newSources.length > 0
    ? `\n\nNEW SOURCE MATERIAL:\n${newSources.map((s, i) => `--- Source ${i + 1} ---\n${truncateSource(s, 6000)}`).join("\n\n")}`
    : "";
  const instructionBlock = options?.instructions ? `\nUSER INSTRUCTIONS: ${options.instructions}` : "";

  const result = await askJson<GuideSection>(`${GUIDE_INSTRUCTIONS}

GUIDE TOPIC: ${topic}
DIFFICULTY: ${context.difficulty}
OTHER SECTIONS: ${context.siblingTitles.join(", ")}

EXISTING SECTION TO REFINE:
${JSON.stringify(existingSection)}${sourceBlock}${instructionBlock}

TASK: Enhance this section with new details, examples, nuance from sources. Keep existing good content. Add code examples, quizzes, interview scenarios from new material. Do not remove existing content unless factually wrong. Preserve the section id and title.

Return ONLY valid JSON:
${SECTION_SCHEMA}`, { timeoutMs: 480_000, skill: "guide-section-refine", model: options?.model });
  const normalized = normalizeGuideSection(result, existingSection);
  const issues = validateGuideSection(normalized);
  if (issues.length > 0) {
    throw new GuideSectionValidationError(
      `Refined section "${existingSection.title}" is incomplete.`,
      issues,
      1
    );
  }
  return normalized;
}

/**
 * Classify which sections are relevant to new source material.
 * Uses Haiku for fast, cheap classification (~$0.01, ~2s).
 */
export async function classifySectionRelevance(
  sectionPlan: Array<{ id: string; title: string; scope: string }>,
  sourceTexts: string[],
  options?: { model?: string }
): Promise<Array<{ sectionId: string; relevant: boolean; reason: string }>> {
  const sourceSummary = sourceTexts.map((s, i) =>
    `Source ${i + 1}: ${truncateSource(s, 2000)}`
  ).join("\n\n");

  return askJson<Array<{ sectionId: string; relevant: boolean; reason: string }>>(`Classify which guide sections would benefit from refinement using the new source material.

SECTIONS:
${sectionPlan.map((sp) => `- ${sp.id}: "${sp.title}" — ${sp.scope}`).join("\n")}

NEW SOURCES:
${sourceSummary}

For each section, determine if the new sources contain information that would meaningfully improve it. Be selective — only mark sections as relevant if the source directly relates to that section's scope.

Return JSON array:
[{"sectionId": "string", "relevant": true/false, "reason": "1 sentence why"}]`, { timeoutMs: 30_000, skill: "section-relevance", model: options?.model || "haiku" });
}
