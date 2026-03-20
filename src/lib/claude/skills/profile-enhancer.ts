import { askJson } from "../client";

export interface EnhanceSuggestion {
  category: "summary" | "experience" | "skills" | "education" | "projects" | "publications" | "certifications" | "recommendations";
  field: string;
  current: string;
  suggested: string;
  reasoning: string;
  impactEstimate: "high" | "medium" | "low";
}

export interface EnhanceResult {
  suggestions: EnhanceSuggestion[];
  overallInsight: string;
}

interface VersionHistory {
  jobTitle: string;
  jobCompany: string;
  score: number;
  delta: number | null;
  snapshot: string;
}

/**
 * Skill: Profile Enhancer
 *
 * Analyzes a candidate's optimization history across multiple job applications
 * to identify universal improvements that would broadly strengthen the profile.
 */
export async function enhanceProfileFromHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentProfile: Record<string, any>,
  versionHistory: VersionHistory[]
): Promise<EnhanceResult> {
  return askJson(`You are a senior career strategist analyzing a professional's resume optimization history across multiple job applications.

CURRENT BASE PROFILE:
${JSON.stringify(currentProfile, null, 2)}

OPTIMIZATION HISTORY (each entry is a version of the profile that was tailored for a specific job, with its ATS score):
${JSON.stringify(
  versionHistory.map((v) => ({
    job: v.jobTitle + " at " + v.jobCompany,
    score: v.score,
    improvement: v.delta,
    optimizedProfile: v.snapshot,
  })),
  null,
  2
)}

YOUR TASK:
Analyze patterns across ALL optimized versions to find UNIVERSAL improvements — changes that would strengthen the base profile regardless of which job the candidate applies to.

Look for:
1. **Summary patterns**: What summary elements appear in the highest-scoring versions? What language/framing works best?
2. **Experience bullet phrasing**: Which rewrites of experience bullets consistently scored higher? What quantifications, action verbs, or framings work?
3. **Skills emphasis**: Which skills are consistently highlighted across high-scoring versions?
4. **Missing elements**: What do optimized versions add that the base profile lacks?
5. **Structural improvements**: Section ordering, emphasis, keyword density patterns
6. **Publications & certifications**: Are relevant publications or certifications being included in high-scoring versions? Should descriptions be refined?
7. **Recommendations**: Are certain recommendations consistently selected? Should recommendation text be refined for broader appeal?

RULES:
- Every suggestion must be grounded in the candidate's REAL experience — never fabricate
- Focus on changes that improve the profile universally, not for one specific job
- Prioritize changes with the highest cross-job impact
- Be specific: show exact before/after text, not vague advice
- Max 8 suggestions, ordered by impact

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "category": "summary",
      "field": "summary",
      "current": "Current text that should change...",
      "suggested": "Improved text...",
      "reasoning": "This phrasing scored 10+ points higher across 3/4 job applications because...",
      "impactEstimate": "high"
    }
  ],
  "overallInsight": "Brief 2-3 sentence analysis of the key patterns found across all optimizations."
}`);
}
