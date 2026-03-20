import { askJson } from "../client";

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
${JSON.stringify(profile, null, 2)}

JOB ANALYSIS:
${JSON.stringify(jobAnalysis, null, 2)}

SCORING RULES:
- Score 0-100 based on how well the candidate's ACTUAL skills and experience match the job
- Direct skill matches count heavily
- Transferable/bridge skills count partially (weighted by how close the transfer is)
- Gaps reduce the score proportionally to their importance in the JD
- Seniority alignment matters: if the job is senior and candidate has 2 years, that's a significant gap

RESUME TIPS RULES — THIS IS CRITICAL:
- Every suggestion MUST be grounded in the candidate's real experience. Set "grounded": true only if the candidate demonstrably has the skill or experience.
- Do NOT suggest claiming skills the candidate doesn't have. Instead suggest:
  - Reframing existing experience to better match JD language (e.g., "Rename 'PostgreSQL' section header to 'Databases' to also surface your MongoDB experience")
  - Emphasizing specific bullets that align with the job's domain
  - Reordering sections to lead with the most relevant experience
  - Using the JD's exact terminology where the candidate genuinely has the skill (ATS matching)
  - Including relevant publications or certifications that strengthen the application
  - Selecting recommendations that speak to skills or qualities the job requires
- If a suggestion requires the candidate to learn something new or stretch the truth, set "grounded": false and frame it as "Consider learning X" rather than "Add X to your resume"
- Max 5 tips, ordered by impact

Return ONLY valid JSON:
{
  "overallScore": 75,
  "breakdown": {
    "directMatches": ["Python", "React", "AWS"],
    "bridgeableSkills": [
      {
        "jobRequirement": "Kubernetes",
        "yourSkill": "Docker + ECS",
        "explanation": "Container orchestration fundamentals transfer — mention containerization experience"
      }
    ],
    "gaps": ["Domain expertise in healthcare", "5+ years management experience"]
  },
  "resumeTips": [
    {
      "priority": 1,
      "action": "Lead your experience section with the role most relevant to this position",
      "impact": "high",
      "grounded": true
    }
  ],
  "skillsToHighlight": ["Python", "React", "AWS", "Docker"],
  "verdictSummary": "Strong technical match (85%) but missing domain experience in healthcare. Focus resume on system design and API work to bridge the gap."
}`);
}
