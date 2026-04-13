import { askJson, compactProfile } from "../client";
import { INTERVIEW_PREP_INSTRUCTIONS, INTERVIEW_PREP_SCHEMA } from "./skill-prompts";

export interface InterviewStory {
  requirement: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
}

export interface InterviewPrep {
  stories: InterviewStory[];
  generalTips: string[];
}

/**
 * Skill: Interview Prep (STAR+R)
 *
 * Generates STAR+R interview stories mapped to key JD requirements,
 * grounded in the candidate's real experience. The Reflection column
 * captures growth/learning and signals seniority.
 */
export async function generateInterviewPrep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  options?: { model?: string }
): Promise<InterviewPrep> {
  return askJson<InterviewPrep>(`${INTERVIEW_PREP_INSTRUCTIONS}

Return ONLY valid JSON:
${INTERVIEW_PREP_SCHEMA}

---

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

TARGET JOB:
${JSON.stringify(jobAnalysis)}`, { timeoutMs: 300_000, skill: "interview-prep", model: options?.model });
}
