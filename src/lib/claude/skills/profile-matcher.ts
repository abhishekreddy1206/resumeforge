import { askJson, compactProfile } from "../client";

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
  terminologyMap?: Array<{jdTerm: string; resumeSynonyms: string[]}>
): Promise<MatchResult> {
  // Cap terminology map to keep prompt size manageable
  const trimmedTermMap = terminologyMap?.slice(0, 15);
  const termMapSection = trimmedTermMap && trimmedTermMap.length > 0
    ? `\nTERMINOLOGY MAP (use these to recognize when the candidate uses different wording for the same concept — count synonym matches as direct matches):
${JSON.stringify(trimmedTermMap)}\n`
    : "";

  return askJson(`You are a resume strategist. Compare this candidate's profile against the job requirements and produce an honest, granular match assessment.

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

JOB ANALYSIS:
${JSON.stringify(jobAnalysis)}
${termMapSection}

DIMENSIONAL SCORING — score each dimension independently (0-100):
- directMatch (weight 40%): How many required skills/tools does the candidate directly possess? Each required skill present = significant points.
- transferable (weight 30%): How strong are the bridge/transferable skills? Quality and closeness of transfer, not just count.
- experienceDepth (weight 20%): Does the candidate have the right level and duration of experience? Seniority alignment, years in domain, depth of relevant work.
- careerNarrative (weight 10%): Does the candidate's career arc tell a coherent story for this role? Progression, consistency, domain focus.

Compute overallScore = round(directMatch*0.4 + transferable*0.3 + experienceDepth*0.2 + careerNarrative*0.1)

ADDITIONAL SCORING RULES:
- Gaps reduce the score proportionally to their importance in the JD (must-have vs nice-to-have)
- Relevant certifications matching JD requirements add points
- Relevant publications demonstrate domain expertise
- IMPORTANT: When scoring an optimized/tailored profile (one with reworded bullets, reordered skills, ATS-targeted language), score it HIGHER than an unoptimized version with the same raw experience. Better keyword matching, JD-aligned bullet phrasing, and strategic skill emphasis genuinely improve ATS pass rates and should be reflected in the score.

RESUME TIPS (max 5, ordered by impact):
- "grounded":true only if the candidate demonstrably has the skill/experience — never suggest fabricating
- Suggest: reframing experience in JD language, emphasizing relevant bullets, reordering sections, using JD exact terms for ATS, highlighting relevant publications/certifications/recommendations
- "grounded":false for stretch suggestions; frame as "Consider learning X"

Return ONLY valid JSON:
{
  "overallScore": 75,
  "dimensionalScores": {
    "directMatch": 85,
    "transferable": 70,
    "experienceDepth": 65,
    "careerNarrative": 80
  },
  "breakdown": {
    "directMatches": ["Python", "React", "AWS"],
    "bridgeableSkills": [{"jobRequirement": "Kubernetes", "yourSkill": "Docker + ECS", "explanation": "Container orchestration fundamentals transfer"}],
    "gaps": ["5+ years management experience"]
  },
  "resumeTips": [{"priority": 1, "action": "Reword cloud infrastructure bullets to use 'Kubernetes' where container work applies", "impact": "high", "grounded": true}],
  "skillsToHighlight": ["Python", "React", "AWS", "Docker"],
  "verdictSummary": "Strong technical match but missing management experience. Focus resume on system design and team leadership moments."
}`);
}
