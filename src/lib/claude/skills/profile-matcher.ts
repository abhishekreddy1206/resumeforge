import { askJson, compactProfile } from "../client";

export interface MatchResult {
  overallScore: number; // 0-100
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
  jobAnalysis: Record<string, any>
): Promise<MatchResult> {
  return askJson(`You are a resume strategist. Compare this candidate's profile against the job requirements and produce an honest match assessment.

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

JOB ANALYSIS:
${JSON.stringify(jobAnalysis)}

SCORING RULES:
- Score 0-100 based on actual skills/experience match; direct matches count heavily, bridge skills count partially, gaps reduce score proportionally, seniority misalignment is significant

RESUME TIPS (max 5, ordered by impact):
- "grounded":true only if candidate demonstrably has the skill — never suggest fabricating
- Suggest: reframing experience in JD language, emphasizing relevant bullets, reordering sections, using JD exact terms (ATS), highlighting relevant publications/certifications/recommendations
- "grounded":false for stretch suggestions; frame as "Consider learning X"

Return ONLY valid JSON:
{
  "overallScore": "number",
  "breakdown": {
    "directMatches": "string[]",
    "bridgeableSkills": [{"jobRequirement":"string","yourSkill":"string","explanation":"string"}],
    "gaps": "string[]"
  },
  "resumeTips": [{"priority":"number","action":"string","impact":"high|medium|low","grounded":"boolean"}],
  "skillsToHighlight": "string[]",
  "verdictSummary": "string"
}`);
}
