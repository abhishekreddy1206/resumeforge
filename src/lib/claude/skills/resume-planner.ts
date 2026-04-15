import { askJson } from "../client";
import {
  RESUME_V2_PLANNER_INSTRUCTIONS,
  RESUME_V2_PLANNER_SCHEMA,
} from "./skill-prompts";
import type {
  JobAnalysisData,
  ResumeOptimizationPlan,
  SourceProfileSnapshot,
} from "@/lib/types";

export async function planResumeOptimization(
  sourceSnapshot: SourceProfileSnapshot,
  jobAnalysis: JobAnalysisData,
  matchResult: Record<string, unknown>,
  options?: { model?: string; validatorFeedback?: string }
): Promise<ResumeOptimizationPlan> {
  const validatorSection = options?.validatorFeedback
    ? `\nVALIDATOR FEEDBACK TO FIX:\n${options.validatorFeedback}\n`
    : "";

  return askJson<ResumeOptimizationPlan>(
    `${RESUME_V2_PLANNER_INSTRUCTIONS}

Return ONLY valid JSON:

${RESUME_V2_PLANNER_SCHEMA}

---

Source Snapshot:
${JSON.stringify(sourceSnapshot)}

Target Job:
${JSON.stringify(jobAnalysis)}

Match Analysis:
${JSON.stringify(matchResult)}
${validatorSection}`,
    {
      timeoutMs: 600_000,
      skill: "resume-planner",
      model: options?.model,
    }
  );
}
