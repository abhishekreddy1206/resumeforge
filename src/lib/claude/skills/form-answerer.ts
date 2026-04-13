import { askJson, compactProfile } from "../client";
import { classifyQuestion, projectProfileForQuestion } from "./form-answerer-utils";
import { FORM_ANSWER_INSTRUCTIONS, FORM_ANSWER_SCHEMA } from "./skill-prompts";

export interface FormAnswerResult {
  answer: string;
}

/**
 * Skill: Form Answer Generator
 *
 * Generates answers for job application screening questions.
 * Uses profile data and job analysis for context.
 * Never fabricates credentials or experience.
 */
export async function generateFormAnswer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  question: string,
  options?: { characterLimit?: number; model?: string; availableOptions?: string[] }
): Promise<FormAnswerResult> {
  const charLimitInstruction = options?.characterLimit
    ? `\nCHARACTER LIMIT: Your answer MUST be ${options.characterLimit} characters or fewer. Count carefully.`
    : "";

  const hasOptions = options?.availableOptions && options.availableOptions.length > 0;
  const optionsInstruction = hasOptions
    ? `\nAVAILABLE OPTIONS (this is a dropdown/select field — you MUST pick one):\n${options!.availableOptions!.map((o, i) => `  ${i + 1}. "${o}"`).join("\n")}\nYour answer MUST be the EXACT text of one of these options. Do not paraphrase, abbreviate, or add anything.`
    : "";

  return askJson<FormAnswerResult>(`${FORM_ANSWER_INSTRUCTIONS}

Return ONLY valid JSON:
${FORM_ANSWER_SCHEMA}

---

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(projectProfileForQuestion(profile, classifyQuestion(question))))}

TARGET JOB:
${JSON.stringify(jobAnalysis)}

QUESTION: "${question}"${charLimitInstruction}${optionsInstruction}`, {
    timeoutMs: 120_000,
    model: options?.model || "haiku",
    skill: "form-answer",
  });
}

/**
 * Skill: Batch Form Answer Generator
 *
 * Answers multiple screening questions in a single Claude call.
 * Sends instructions + profile + job once instead of per-question,
 * reducing token usage by ~80% for batches of 3+ questions.
 * Falls back to individual calls on parse failure.
 */
export async function generateFormAnswerBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  questions: Array<{
    question: string;
    characterLimit?: number;
    availableOptions?: string[];
  }>,
  options?: { model?: string }
): Promise<FormAnswerResult[]> {
  const questionsBlock = questions
    .map((q, i) => {
      let line = `${i + 1}. "${q.question}"`;
      if (q.characterLimit) {
        line += `\n   CHARACTER LIMIT: ${q.characterLimit} characters or fewer.`;
      }
      if (q.availableOptions && q.availableOptions.length > 0) {
        line += `\n   OPTIONS (must pick exactly one): ${JSON.stringify(q.availableOptions)}`;
      }
      return line;
    })
    .join("\n\n");

  return askJson<FormAnswerResult[]>(`${FORM_ANSWER_INSTRUCTIONS}

For dropdown/select fields with OPTIONS listed: your answer MUST be the EXACT text of one option. Do not paraphrase.

Return ONLY a JSON array of objects [{"answer":"string"}, ...] in the same order as the questions.

---

CANDIDATE PROFILE:
${JSON.stringify(profile)}

TARGET JOB:
${JSON.stringify(jobAnalysis)}

QUESTIONS:
${questionsBlock}`, {
    timeoutMs: 180_000,
    model: options?.model || "haiku",
    skill: "form-answer-batch",
  });
}
