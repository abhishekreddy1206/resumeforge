import { askJson } from "../client";
import { CRITIQUE_INSTRUCTIONS, CRITIQUE_SCHEMA } from "./skill-prompts";
import type { ResumeData } from "@/lib/types";

interface PerspectiveScore {
  perspective: string;
  timeSpent: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
}

interface DimensionScore {
  dimension: string;
  weight: number;
  score: number;
  feedback: string;
}

export interface ResumeCritique {
  perspectives: PerspectiveScore[];
  dimensions: DimensionScore[];
  overallScore: number;
  atsKeywordMatchRate: number;
  aiFingerprints: string[];
  topImprovements: Array<{
    priority: number;
    change: string;
    pointImpact: number;
  }>;
  verdict: "submit" | "strong" | "needs_work" | "fundamental_issues";
}

/**
 * Skill: Resume Critic
 *
 * Multi-perspective critique system inspired by claude-resume-kit.
 * Evaluates a generated resume from 5 reader perspectives and
 * scores across 8 weighted dimensions.
 */
export async function critiqueResume(
  resume: ResumeData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  options?: { model?: string }
): Promise<ResumeCritique> {
  return askJson<ResumeCritique>(`${CRITIQUE_INSTRUCTIONS}

Return ONLY valid JSON:

${CRITIQUE_SCHEMA}

---

Resume content:
${JSON.stringify(resume)}

Target Job:
${JSON.stringify(jobAnalysis)}`, { timeoutMs: 600_000, skill: "resume-critic", model: options?.model });
}
