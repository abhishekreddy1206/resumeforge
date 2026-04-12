import { askJson, compactProfile } from "../client";
import { classifyQuestion, projectProfileForQuestion } from "./form-answerer-utils";

interface FormAnswerResult {
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

  return askJson<FormAnswerResult>(`You are filling out a job application form. Answer the following screening question accurately based on the candidate's real profile.

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(projectProfileForQuestion(profile, classifyQuestion(question))))}

TARGET JOB:
${JSON.stringify(jobAnalysis)}

QUESTION: "${question}"
${charLimitInstruction}${optionsInstruction}

RULES:
${hasOptions ? "- This is a dropdown/select field. Your answer MUST be copied verbatim from the AVAILABLE OPTIONS list above." : "- Answer the question directly and concisely"}
- For yes/no questions: answer "Yes" or "No"${hasOptions ? "" : " with a brief one-sentence elaboration if helpful"}
- For factual questions (years of experience, specific skills): calculate from the profile data, never guess
- For behavioral questions ("describe a time..."): draw from real experience entries in the profile, keep to 3-5 sentences
- For motivation questions ("why this role?"): connect the candidate's background to the job specifics, 2-3 sentences
- For salary questions: provide the range if available in profile, otherwise respond with "Open to discussion"
- NEVER fabricate credentials, certifications, years of experience, or achievements not in the profile
- Write naturally as the candidate would, first person
- No sycophancy, no filler

Return ONLY valid JSON:
{
  "answer": "Your direct answer to the question"
}`, {
    timeoutMs: 120_000,
    model: options?.model,
    skill: "form-answer",
  });
}
