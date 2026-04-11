import { askJson } from "../client";
import { GUIDE_INSTRUCTIONS, GUIDE_SCHEMA, SECTION_SCHEMA, OUTLINE_SCHEMA, truncateSource } from "./guide-prompts";

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
      hasCode: s.codeExamples.length > 0,
      checkCount: s.knowledgeChecks.length,
      scenarioCount: s.interviewScenarios.length,
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
 * Generate a single section's full content. Designed to run in parallel
 * with other section generations.
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

  return askJson<GuideSection>(`${GUIDE_INSTRUCTIONS}

GUIDE TOPIC: ${topic}
DIFFICULTY: ${context.difficulty}
OTHER SECTIONS: ${context.siblingTitles.join(", ")}

SECTION TO WRITE:
- ID: ${sectionPlan.id}
- Title: ${sectionPlan.title}
- Scope: ${sectionPlan.scope}${sourceBlock}

Return ONLY valid JSON:
${SECTION_SCHEMA}`, { timeoutMs: 300_000, skill: "guide-section", model: options?.model });
}
