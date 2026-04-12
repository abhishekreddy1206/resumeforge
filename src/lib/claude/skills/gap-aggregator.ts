import { askJson } from "../client";

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

  return askJson(`You are a career strategy analyst. Analyze match results from multiple job applications to identify cross-job patterns and prioritize skill development.

MATCH DATA FROM ${trimmedData.length} JOBS:
${JSON.stringify(trimmedData)}

TASKS:

1. AGGREGATE GAPS — merge semantically similar gaps across jobs:
   - "Kubernetes experience" and "K8s orchestration" should merge into one gap
   - Use the most descriptive phrasing as the canonical name
   - Include all JD variants in relatedTerms
   - Classify severity: "critical" (3+ jobs), "important" (2 jobs), "specific" (1 job)
   - Sort by frequency (highest first)

2. LEVERAGE SCORES — identify which skills to develop for maximum job coverage:
   - For each major gap, estimate how many jobs it would positively impact if filled
   - Consider both direct gaps AND bridgeable skills that would become direct matches
   - Focus on actionable skills (not years-of-experience gaps)
   - estimatedImpact: "high" (unlocks 3+ jobs), "medium" (2 jobs), "low" (1 job)
   - Sort by jobsUnlocked (highest first)
   - Max 8 entries

3. TERMINOLOGY OVERLAP — find terms that appear across multiple JDs:
   - Include terms from directMatches, gaps, and terminologyMaps
   - Only include terms appearing in 2+ jobs
   - List all variant phrasings across JDs
   - Sort by frequency

4. SUMMARY — 2-3 sentence strategic overview of the candidate's cross-job position

Return ONLY valid JSON:
{
  "aggregatedGaps": [
    {"gap": "Container orchestration (Kubernetes)", "frequency": 3, "severity": "critical", "jobs": ["SWE at Google", "DevOps at Meta"], "relatedTerms": ["Kubernetes", "K8s", "container orchestration"]}
  ],
  "leverageScores": [
    {"skill": "Kubernetes", "jobsUnlocked": 3, "jobs": ["SWE at Google", "DevOps at Meta", "SRE at Netflix"], "estimatedImpact": "high"}
  ],
  "terminologyOverlap": [
    {"term": "CI/CD", "variants": ["CI/CD pipelines", "continuous integration", "build automation"], "frequency": 4}
  ],
  "summary": "Strong technical foundation across all roles. Container orchestration is the single biggest gap — addressing it would strengthen candidacy for 3 of 5 target roles."
}`, { skill: "gap-aggregator", model: options?.model });
}
