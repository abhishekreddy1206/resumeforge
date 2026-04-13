import { askJson } from "../client";
import {
  GUIDE_INSTRUCTIONS, GUIDE_SCHEMA, SECTION_SCHEMA, OUTLINE_SCHEMA, truncateSource,
  SECTION_CORE_INSTRUCTIONS, SECTION_CORE_SCHEMA,
  SECTION_ASSESSMENT_INSTRUCTIONS, SECTION_ASSESSMENT_SCHEMA,
} from "./guide-prompts";
import { createLogger } from "@/lib/logger";

const log = createLogger("guide-generator");

export type SectionGenStatus = "pending" | "generating" | "completed" | "failed" | "refining";

export interface GuideContentStorage extends GuideContent {
  _sectionPlan?: Array<{ id: string; title: string; scope: string }>;
  _sectionStatuses?: Record<string, SectionGenStatus>;
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

  return askJson<GuideContent>(`${GUIDE_INSTRUCTIONS}

TOPIC: ${topic}${difficultyHint}${sourceBlock}

Return ONLY valid JSON matching this structure:
${GUIDE_SCHEMA}`, { timeoutMs: 600_000, skill: "guide-generator", model: options?.model });
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

  return askJson<RefineResult>(`${GUIDE_INSTRUCTIONS}

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
}`, { timeoutMs: 600_000, skill: "guide-generator", model: options?.model });
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

  return askJson<GuideOutline>(`${GUIDE_INSTRUCTIONS}

TOPIC: ${topic}${difficultyHint}${sourceBlock}

Plan 4-8 sections that progressively build understanding. Do NOT write section content — only plan structure.

Return ONLY valid JSON:
${OUTLINE_SCHEMA}`, { timeoutMs: 120_000, skill: "guide-outline", model: options?.model });
}

/**
 * Generate a single section's full content via two sequential calls:
 * 1. Core: explanation, code examples, key takeaways (~60s)
 * 2. Assessment: knowledge checks, interview scenarios (~50s)
 *
 * If the assessment call fails, returns the section with empty assessments
 * rather than failing the entire section.
 */
export async function generateGuideSection(
  topic: string,
  sectionPlan: { id: string; title: string; scope: string },
  context: { difficulty: string; siblingTitles: string[] },
  options?: { sources?: string[]; model?: string }
): Promise<GuideSection> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL:\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${truncateSource(s, 6000)}`).join("\n\n")}`
    : "";

  const sectionContext = `
GUIDE TOPIC: ${topic}
DIFFICULTY: ${context.difficulty}
OTHER SECTIONS: ${context.siblingTitles.join(", ")}

SECTION TO WRITE:
- ID: ${sectionPlan.id}
- Title: ${sectionPlan.title}
- Scope: ${sectionPlan.scope}${sourceBlock}`;

  // Call 1: Core content — explanation, code, takeaways
  const core = await askJson<{
    id: string;
    title: string;
    explanation: string;
    codeExamples: Array<{ language: string; code: string; caption: string }>;
    keyTakeaways: string[];
  }>(`${SECTION_CORE_INSTRUCTIONS}
${sectionContext}

Return ONLY valid JSON:
${SECTION_CORE_SCHEMA}`, { timeoutMs: 480_000, skill: "guide-section-core", model: options?.model });

  // Call 2: Assessment content — quizzes and interview scenarios
  let knowledgeChecks: GuideSection["knowledgeChecks"] = [];
  let interviewScenarios: GuideSection["interviewScenarios"] = [];

  try {
    const assessment = await askJson<{
      knowledgeChecks: GuideSection["knowledgeChecks"];
      interviewScenarios: GuideSection["interviewScenarios"];
    }>(`${SECTION_ASSESSMENT_INSTRUCTIONS}

SECTION EXPLANATION:
${core.explanation.slice(0, 4000)}
${sectionContext}

Return ONLY valid JSON:
${SECTION_ASSESSMENT_SCHEMA}`, { timeoutMs: 480_000, skill: "guide-section-assessment", model: options?.model });

    knowledgeChecks = assessment.knowledgeChecks || [];
    interviewScenarios = assessment.interviewScenarios || [];
  } catch (err) {
    log.warn("section_assessment_failed", { sectionId: sectionPlan.id, sectionTitle: sectionPlan.title, error: err instanceof Error ? err : new Error(String(err)) });
  }

  return {
    id: core.id || sectionPlan.id,
    title: core.title || sectionPlan.title,
    explanation: core.explanation,
    codeExamples: core.codeExamples || [],
    knowledgeChecks,
    interviewScenarios,
    keyTakeaways: core.keyTakeaways || [],
  };
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

  return askJson<GuideSection>(`${GUIDE_INSTRUCTIONS}

GUIDE TOPIC: ${topic}
DIFFICULTY: ${context.difficulty}
OTHER SECTIONS: ${context.siblingTitles.join(", ")}

EXISTING SECTION TO REFINE:
${JSON.stringify(existingSection)}${sourceBlock}${instructionBlock}

TASK: Enhance this section with new details, examples, nuance from sources. Keep existing good content. Add code examples, quizzes, interview scenarios from new material. Do not remove existing content unless factually wrong. Preserve the section id and title.

Return ONLY valid JSON:
${SECTION_SCHEMA}`, { timeoutMs: 480_000, skill: "guide-section-refine", model: options?.model });
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
