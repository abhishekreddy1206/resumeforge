import { askJson } from "../client";
import {
  CRITIQUE_INSTRUCTIONS,
  CRITIQUE_SCHEMA,
  RESUME_ARTIFACT_EVALUATOR_INSTRUCTIONS,
  RESUME_ARTIFACT_EVALUATOR_SCHEMA,
} from "./skill-prompts";
import type {
  JobAnalysisData,
  ResumeArtifactEvaluation,
  ResumeData,
  ResumeOptimizationPlan,
  SourceProfileSnapshot,
} from "@/lib/types";

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

interface ArtifactEvaluationResponse {
  overallScore: number;
  dimensions: ResumeArtifactEvaluation["dimensions"];
  suggestedFixes: string[];
  verdict: "ready" | "needs_review" | "blocked";
}

// The v2 evaluator is pinned so scores stay comparable across pipeline runs
// even when a job's aiModel differs. The planner/writer still honor the
// caller-supplied model — only the scoring step is pinned.
// The Claude Code CLI subprocess does not expose temperature or seed, so
// evaluator output remains stochastic run-to-run; the auto-pipeline's
// regression tolerance absorbs that noise.
const EVALUATOR_MODEL = "sonnet";

/**
 * Evaluate a resume artifact against source evidence and job requirements.
 * Returns a partial evaluation — call `finalizeResumeArtifactEvaluation` to
 * merge deterministic validation issues and compute real metrics.
 */
export async function evaluateResumeArtifact(
  resume: ResumeData,
  sourceSnapshot: SourceProfileSnapshot,
  jobAnalysis: JobAnalysisData,
  matchResult: Record<string, unknown>,
  optimizationPlan: ResumeOptimizationPlan
): Promise<ResumeArtifactEvaluation> {
  const evaluation = await askJson<ArtifactEvaluationResponse>(
    `${RESUME_ARTIFACT_EVALUATOR_INSTRUCTIONS}

Return ONLY valid JSON matching this schema:

${RESUME_ARTIFACT_EVALUATOR_SCHEMA}

---

Source Snapshot:
${JSON.stringify(sourceSnapshot)}

ResumeOptimizationPlan:
${JSON.stringify(optimizationPlan)}

Resume Artifact:
${JSON.stringify(resume)}

Target Job:
${JSON.stringify(jobAnalysis)}

Match Analysis:
${JSON.stringify(matchResult)}`,
    { timeoutMs: 600_000, skill: "resume-artifact-evaluator", model: EVALUATOR_MODEL }
  );

  return {
    version: 2,
    overallScore: evaluation.overallScore,
    dimensions: evaluation.dimensions,
    hardBlockers: [],
    warnings: [],
    verdict: evaluation.verdict,
    suggestedFixes: evaluation.suggestedFixes,
    metrics: {
      summaryWordCount: 0,
      summarySentenceCount: 0,
      experienceCount: 0,
      projectCount: 0,
      supportSectionCount: 0,
      totalBulletCount: 0,
      bulletsWithMetrics: 0,
      repeatedKeywordCount: 0,
      pagePressure: "low",
    },
  };
}

/**
 * Legacy critique wrapper kept for the existing critique UI.
 * The user-facing structure remains the same, but the scoring now comes from the
 * v2 artifact evaluator first and falls back to the legacy critique prompt only
 * when source evidence isn't available.
 */
export async function critiqueResume(
  resume: ResumeData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  options?: { model?: string }
): Promise<ResumeCritique> {
  try {
    const artifactEvaluation = await askJson<ArtifactEvaluationResponse>(
      `${RESUME_ARTIFACT_EVALUATOR_INSTRUCTIONS}

Return ONLY valid JSON:

${RESUME_ARTIFACT_EVALUATOR_SCHEMA}

---

Resume Artifact:
${JSON.stringify(resume)}

Target Job:
${JSON.stringify(jobAnalysis)}`,
      { timeoutMs: 600_000, skill: "resume-critic", model: options?.model }
    );

    const perspectives: PerspectiveScore[] = [
      {
        perspective: "ATS Robot",
        timeSpent: "0s",
        score: artifactEvaluation.dimensions.find((item) => item.dimension === "ats_compatibility")?.score ?? artifactEvaluation.overallScore,
        strengths: [],
        weaknesses: [],
      },
      {
        perspective: "Recruiter",
        timeSpent: "10s",
        score: artifactEvaluation.dimensions.find((item) => item.dimension === "recruiter_scanability")?.score ?? artifactEvaluation.overallScore,
        strengths: [],
        weaknesses: [],
      },
      {
        perspective: "Hiring Manager",
        timeSpent: "2min",
        score: artifactEvaluation.dimensions.find((item) => item.dimension === "evidence_strength")?.score ?? artifactEvaluation.overallScore,
        strengths: [],
        weaknesses: [],
      },
    ];

    const dimensions: DimensionScore[] = artifactEvaluation.dimensions.map((dimension) => ({
      dimension: dimension.dimension,
      weight: 1 / Math.max(artifactEvaluation.dimensions.length, 1),
      score: dimension.score,
      feedback: dimension.rationale,
    }));

    return {
      perspectives,
      dimensions,
      overallScore: artifactEvaluation.overallScore,
      atsKeywordMatchRate:
        artifactEvaluation.dimensions.find((item) => item.dimension === "ats_compatibility")?.score ??
        artifactEvaluation.overallScore,
      aiFingerprints: [],
      topImprovements: artifactEvaluation.suggestedFixes.slice(0, 5).map((change, index) => ({
        priority: index + 1,
        change,
        pointImpact: 2,
      })),
      verdict:
        artifactEvaluation.verdict === "ready"
          ? "submit"
          : artifactEvaluation.verdict === "needs_review"
            ? "needs_work"
            : "fundamental_issues",
    };
  } catch {
    return askJson<ResumeCritique>(
      `${CRITIQUE_INSTRUCTIONS}

Return ONLY valid JSON:

${CRITIQUE_SCHEMA}

---

Resume content:
${JSON.stringify(resume)}

Target Job:
${JSON.stringify(jobAnalysis)}`,
      { timeoutMs: 600_000, skill: "resume-critic-legacy", model: options?.model }
    );
  }
}
