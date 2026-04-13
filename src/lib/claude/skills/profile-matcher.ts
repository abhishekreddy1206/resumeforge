import { askJson, compactProfile } from "../client";
import { MATCHING_INSTRUCTIONS, MATCHING_SCHEMA } from "./skill-prompts";

export interface MatchResult {
  overallScore: number; // 0-100
  dimensionalScores?: {
    directMatch: number;      // 0-100, weight 40% — required skills/tools directly possessed
    transferable: number;     // 0-100, weight 30% — bridge/transferable skill quality
    experienceDepth: number;  // 0-100, weight 20% — seniority alignment, years in domain
    careerNarrative: number;  // 0-100, weight 10% — career arc coherence for this role
  };
  breakdown: {
    directMatches: string[]; // skills/requirements you directly satisfy
    bridgeableSkills: Array<{
      jobRequirement: string;
      yourSkill: string;
      explanation: string;
    }>;
    gaps: string[]; // requirements you don't cover
  };
  resumeTips: Array<{
    priority: number; // 1 = highest
    action: string; // what to change in your resume
    impact: "high" | "medium" | "low";
    grounded: boolean; // true = based on real experience, false = would be a stretch
  }>;
  skillsToHighlight: string[]; // existing skills to emphasize
  verdictSummary: string; // 1-2 sentence assessment
}

/**
 * Skill: Profile Matcher
 *
 * Compares a candidate's profile against a job's requirements
 * and returns a match score with actionable, grounded suggestions.
 * Suggestions must stay truthful to the candidate's real experience.
 */
export async function matchProfileToJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  terminologyMap?: Array<{jdTerm: string; resumeSynonyms: string[]}>,
  options?: { model?: string }
): Promise<MatchResult> {
  // Cap terminology map to keep prompt size manageable
  const trimmedTermMap = terminologyMap?.slice(0, 15);
  const termMapSection = trimmedTermMap && trimmedTermMap.length > 0
    ? `\nTERMINOLOGY MAP (use these to recognize when the candidate uses different wording for the same concept — count synonym matches as direct matches):
${JSON.stringify(trimmedTermMap)}\n`
    : "";

  return askJson(`${MATCHING_INSTRUCTIONS}

Return ONLY valid JSON:

${MATCHING_SCHEMA}

---

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

JOB ANALYSIS:
${JSON.stringify(jobAnalysis)}
${termMapSection}`, { skill: "profile-matcher", model: options?.model });
}
