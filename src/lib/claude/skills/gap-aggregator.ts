import { askJson } from "../client";
import { GAP_ANALYSIS_INSTRUCTIONS, GAP_ANALYSIS_SCHEMA } from "./skill-prompts";

export interface AggregatedGap {
  gap: string;
  frequency: number;
  severity: "critical" | "important" | "specific";
  jobs: string[];
  relatedTerms: string[];
}

export interface LeverageScore {
  skill: string;
  jobsUnlocked: number;
  jobs: string[];
  estimatedImpact: "high" | "medium" | "low";
}

export interface AggregateTermMap {
  term: string;
  variants: string[];
  frequency: number;
}

export interface GapAggregation {
  aggregatedGaps: AggregatedGap[];
  leverageScores: LeverageScore[];
  terminologyOverlap: AggregateTermMap[];
  summary: string;
}

/**
 * Skill: Gap Aggregator
 *
 * Analyzes match results from multiple jobs to produce cross-job intelligence:
 * - Semantically merged gaps (not just exact string match)
 * - Leverage scores (which skills to develop for maximum impact)
 * - Cross-JD terminology overlap
 */
export async function aggregateGaps(
  jobMatchData: Array<{
    title: string;
    company: string;
    gaps: string[];
    bridgeableSkills: Array<{ jobRequirement: string; yourSkill: string }>;
    directMatches: string[];
    terminologyMap?: Array<{ jdTerm: string; resumeSynonyms: string[] }>;
  }>,
  options?: { model?: string }
): Promise<GapAggregation> {
  // Cap data per job to keep prompt manageable with many jobs
  const trimmedData = jobMatchData.slice(0, 20).map((j) => ({
    title: j.title,
    company: j.company,
    gaps: j.gaps.slice(0, 10),
    bridgeableSkills: j.bridgeableSkills.slice(0, 8),
    directMatches: j.directMatches.slice(0, 10),
    terminologyMap: j.terminologyMap?.slice(0, 10),
  }));

  return askJson(`${GAP_ANALYSIS_INSTRUCTIONS}

Return ONLY valid JSON:

${GAP_ANALYSIS_SCHEMA}

---

MATCH DATA FROM ${trimmedData.length} JOBS:
${JSON.stringify(trimmedData)}`, { skill: "gap-aggregator", model: options?.model });
}
