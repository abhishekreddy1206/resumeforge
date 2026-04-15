import { askJson, compactProfile } from "../client";
import {
  RESUME_V2_WRITER_INSTRUCTIONS,
  RESUME_V2_WRITER_SCHEMA,
  RESUME_WRITING_INSTRUCTIONS,
  RESUME_WRITING_SCHEMA,
} from "./skill-prompts";
import type {
  JobAnalysisData,
  ResumeData,
  ResumeOptimizationPlan,
  SourceProfileSnapshot,
} from "@/lib/types";

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

export async function generateResumeFromPlan(
  sourceSnapshot: SourceProfileSnapshot,
  jobAnalysis: JobAnalysisData,
  matchResult: Record<string, unknown>,
  plan: ResumeOptimizationPlan,
  options?: { model?: string; validatorFeedback?: string }
) {
  const validatorSection = options?.validatorFeedback
    ? `\nVALIDATOR FEEDBACK TO FIX:\n${options.validatorFeedback}\n`
    : "";

  return askJson<ResumeData>(
    `${RESUME_V2_WRITER_INSTRUCTIONS}

Return ONLY valid JSON:

${RESUME_V2_WRITER_SCHEMA}

---

Source Snapshot:
${JSON.stringify(sourceSnapshot)}

ResumeOptimizationPlan:
${JSON.stringify(plan)}

Target Job:
${JSON.stringify(jobAnalysis)}

Match Analysis:
${JSON.stringify(matchResult)}
${validatorSection}`,
    { timeoutMs: 600_000, skill: "resume-writer-v2", model: options?.model }
  );
}
