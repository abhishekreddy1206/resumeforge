import { askJson, AI_FINGERPRINT_BANNED } from "../client";
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

MULTI-PERSPECTIVE REVIEW (score 0-100 each):
1. ATS Robot (0s): Count verbatim keyword matches vs JD terms; flag high-priority missing keywords.
2. Recruiter (10s): Does summary/title grab attention and surface the right keywords for the seniority level?
3. HR Screener (30s): Does the candidate meet stated requirements (years, degree, must-haves)? Red flags?
4. Hiring Manager (2min): Are achievements relevant and impressive? Does career narrative fit this role?
5. Technical Reviewer (10min): Are technical claims credible, specific, and internally consistent?

DIMENSION SCORING (weighted, score 0-100):
1. ATS Optimization (15%) — Keyword match rate, formatting compatibility
2. Bullet Quality (20%) — Action verbs, quantified impact, specificity
3. Narrative Coherence (15%) — Career story aligns with target role
4. Relevance (15%) — Content tailored to this specific JD
5. Formatting & Length (10%) — Clean, scannable, appropriate length
6. Skills Presentation (5%) — Grouped well, JD-aligned ordering
7. Summary Effectiveness (10%) — Compelling, keyword-rich, role-specific
8. Authenticity (5%) — Reads as human-written, no AI fingerprints
9. Supporting Sections (5%) — Publications, certifications, and recommendations are relevant and well-selected

AI FINGERPRINT SCAN — list any found:
${AI_FINGERPRINT_BANNED}
Also flag: bullets ending in gerund pattern, all bullets same length, generic claims without specifics.

ATS KEYWORD MATCH RATE: Count JD key terms appearing verbatim in the resume; return as percentage.

TOP IMPROVEMENTS: List top 5 changes ranked by estimated point impact.

Verdict: 85+→submit, 80-84→strong, 75-79→needs_work, <75→fundamental_issues

Return ONLY valid JSON:

{
  "perspectives": [{"perspective":"string","timeSpent":"string","score":"number","strengths":"string[]","weaknesses":"string[]"}],
  "dimensions": [{"dimension":"string","weight":"number","score":"number","feedback":"string"}],
  "overallScore": "number",
  "atsKeywordMatchRate": "number",
  "aiFingerprints": "string[]",
  "topImprovements": [{"priority":"number","change":"string","pointImpact":"number"}],
  "verdict": "submit|strong|needs_work|fundamental_issues"
}

Resume content:
${JSON.stringify(resume)}

Target Job:
${JSON.stringify(jobAnalysis)}`, { timeoutMs: 300_000 });
}
