import { askJson, compactProfile } from "../client";
import { RESUME_WRITING_INSTRUCTIONS, RESUME_WRITING_SCHEMA } from "./skill-prompts";
import type { ResumeData } from "@/lib/types";

/**
 * Skill: Resume Writer (ATS-Optimized)
 *
 * Generates a tailored, ATS-optimized resume given a candidate profile
 * and a target job. Incorporates techniques from claude-resume-kit:
 * - Priority hierarchy: Accuracy > Relevance > Impact > ATS > Brevity
 * - AI fingerprint avoidance (banned words, structural rules)
 * - FLIPPED position format (domain-themed titles)
 * - Verb discipline (ownership vs contribution)
 * - Bridge/gap-aware keyword matching
 * - ATS keyword verbatim match rate targeting (>=70%)
 */
export async function generateTailoredResume(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  options?: { model?: string }
) {
  return askJson<ResumeData>(`${RESUME_WRITING_INSTRUCTIONS}

Return ONLY valid JSON:

${RESUME_WRITING_SCHEMA}

---

Candidate Profile:
${JSON.stringify(compactProfile(profile))}

Target Job:
${JSON.stringify(jobAnalysis)}`, { timeoutMs: 600_000, skill: "resume-writer", model: options?.model });
}
