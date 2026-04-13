import { askJson, compactProfile } from "../client";
import { COVER_LETTER_INSTRUCTIONS, COVER_LETTER_SCHEMA } from "./skill-prompts";
import type { CoverLetterData } from "@/lib/types";

/**
 * Skill: Cover Letter Writer
 *
 * Generates a tailored cover letter given a candidate profile,
 * target job analysis, and optionally the generated resume content
 * (to complement rather than duplicate it).
 */
export async function generateCoverLetter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumeContent?: Record<string, any> | null,
  options?: { model?: string }
): Promise<CoverLetterData> {
  const resumeSection = resumeContent
    ? `\nGENERATED RESUME (complement this — do NOT repeat the same bullet points or phrasing):
${JSON.stringify(resumeContent)}\n`
    : "";

  return askJson<CoverLetterData>(`${COVER_LETTER_INSTRUCTIONS}

Return ONLY valid JSON:
${COVER_LETTER_SCHEMA}

---

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

TARGET JOB:
${JSON.stringify(jobAnalysis)}
${resumeSection}`, { timeoutMs: 300_000, skill: "cover-letter-writer", model: options?.model });
}
