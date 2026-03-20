import { askJson } from "../client";
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
  jobAnalysis: Record<string, any>
): Promise<ResumeCritique> {
  return askJson<ResumeCritique>(`You are an expert resume reviewer. Critique this resume against the target job from multiple perspectives.

MULTI-PERSPECTIVE REVIEW:
Evaluate from each reader's perspective, scoring 0-100:

1. ATS Robot (0 seconds): Keyword matching only. Does the resume contain the exact terms from the JD? Count verbatim matches vs semantic-only matches. Flag high-priority missing keywords.

2. Recruiter (10 seconds): Quick scan. Does the title/summary grab attention? Are the right keywords visible? Does seniority level match? Would this make the "yes" pile in 10 seconds?

3. HR Screener (30 seconds): Requirements check. Does the candidate meet the stated requirements (years of experience, degree, must-haves)? Any red flags (gaps, job hopping, overqualification)?

4. Hiring Manager (2 minutes): Depth review. Are the achievements relevant and impressive? Does the career narrative make sense for this role? Would they want to interview this person?

5. Technical Reviewer (10 minutes): Detail scrutiny. Are the technical claims credible and specific? Do the technologies and approaches make sense together? Are impact numbers believable?

DIMENSION SCORING (weighted):
Score each 0-100:
1. ATS Optimization (15%) — Keyword match rate, formatting compatibility
2. Bullet Quality (20%) — Action verbs, quantified impact, specificity
3. Narrative Coherence (15%) — Career story aligns with target role
4. Relevance (15%) — Content tailored to this specific JD
5. Formatting & Length (10%) — Clean, scannable, appropriate length
6. Skills Presentation (5%) — Grouped well, JD-aligned ordering
7. Summary Effectiveness (10%) — Compelling, keyword-rich, role-specific
8. Authenticity (5%) — Reads as human-written, no AI fingerprints
9. Supporting Sections (5%) — Publications, certifications, and recommendations are relevant and well-selected for this role

AI FINGERPRINT SCAN:
Check for these markers and list any found:
- Banned words: delve, tapestry, multifaceted, pivotal, synergy, paradigm, holistic, leverage (verb), utilize, facilitate, foster, robust, comprehensive, cutting-edge
- Banned phrases: "proven track record", "passionate about", "at the intersection of"
- Structural markers: bullets ending in "-ing" gerund analysis, overuse of em-dashes, all bullets same length
- Generic claims without specifics

ATS KEYWORD MATCH RATE:
Count how many of the JD's key technical terms appear verbatim in the resume. Return as a percentage.

TOP IMPROVEMENTS:
List the top 5 changes ranked by estimated point impact on the overall score.

SCORING GUIDE:
- 85+: "submit" — Ready to send
- 80-84: "strong" — Minor tweaks would help
- 75-79: "needs_work" — Reframing needed
- <75: "fundamental_issues" — Major rework required

Return ONLY valid JSON:

{
  "perspectives": [
    {
      "perspective": "ATS Robot",
      "timeSpent": "0 seconds",
      "score": 85,
      "strengths": ["good keyword density"],
      "weaknesses": ["missing 'Terraform' verbatim"]
    }
  ],
  "dimensions": [
    {
      "dimension": "ATS Optimization",
      "weight": 15,
      "score": 80,
      "feedback": "Specific feedback"
    }
  ],
  "overallScore": 82,
  "atsKeywordMatchRate": 73,
  "aiFingerprints": ["Found 'leverage' in summary", "Two bullets end with gerund pattern"],
  "topImprovements": [
    {
      "priority": 1,
      "change": "Replace 'utilized' with specific tool name in bullet 3",
      "pointImpact": 3
    }
  ],
  "verdict": "strong"
}

Resume content:
${JSON.stringify(resume, null, 2)}

Target Job:
${JSON.stringify(jobAnalysis, null, 2)}`, { timeoutMs: 240_000 });
}
