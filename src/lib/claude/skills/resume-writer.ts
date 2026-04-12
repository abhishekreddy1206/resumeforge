import { askJson, compactProfile, AI_FINGERPRINT_BANNED, ROLE_ARCHETYPES } from "../client";
import type { ResumeData } from "@/lib/types";

/**
 * Skill: Resume Writer (ATS-Optimized)
 *
 * Generates a tailored, ATS-optimized resume given a candidate profile
 * and a target job. Incorporates techniques from claude-resume-kit:
 * - Priority hierarchy: Accuracy > Relevance > Impact > ATS > Brevity
 * - AI fingerprint avoidance (banned words, structural rules)
 * - FLIPPED position format (domain-themed titles)
 * - Verb discipline (ownership vs contribution)
 * - Bridge/gap-aware keyword matching
 * - ATS keyword verbatim match rate targeting (>=70%)
 */
export async function generateTailoredResume(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  options?: { model?: string }
) {
  return askJson<ResumeData>(`You are an expert ATS-optimized resume writer. Given the candidate's profile and target job, create a tailored resume.

Priority: exact experience match > transferable skills > education > keywords

BULLET POINT PRINCIPLES:
- Lead with a strong ACTION VERB (Engineered, Reduced, Launched, Architected, Automated, Deployed, Migrated, Optimized, Scaled)
- Include QUANTIFIED IMPACT wherever possible: %, $, time saved, team size, requests/sec
- Mirror EXACT KEYWORDS from the job description (ATS systems match literally)
- Keep to 1-2 lines per bullet; max 5-6 bullets per role; most recent role gets the most, older roles 2-3

VERB DISCIPLINE:
Use strong past-tense action verbs. Never upgrade contribution level (don't say 'led' if assisted).

FLIPPED POSITION FORMAT:
Write each experience title as a JD-customized domain theme (e.g., "Full-Stack Engineer — Payments & Checkout Systems") — strongest JD customization lever while remaining truthful.

ATS KEYWORD STRATEGY:
- Target >=70% verbatim match rate using exact JD terms, not synonyms
- Reframe transferable experience using JD vocabulary; skills section ordering should reflect the JD

TERMINOLOGY BRIDGING:
When the candidate's profile uses a synonym for a JD term, ALWAYS rewrite to use the JD's exact term.
Example: JD says "RAG pipelines", profile says "LLM workflows with retrieval" → write "RAG pipeline design"
Apply same bridging to all JD terms where profile uses a synonym. Stay truthful.

ARCHETYPE-ADAPTIVE FRAMING:
Adapt framing by roleArchetype:
${ROLE_ARCHETYPES}

Per-archetype emphasis:
- backend-engineer: system design, APIs, scalability, performance
- frontend-engineer: user experience, performance, accessibility, design systems
- fullstack-engineer: end-to-end delivery, versatility across stack
- platform-engineer: scale, reliability, automation, cost optimization, infrastructure
- ml-engineer: model performance, data pipelines, experimentation, production ML
- data-engineer: data pipelines, ETL, data quality, warehousing, scale
- engineering-manager: team growth, process improvement, cross-functional delivery
- technical-pm: customer impact, technical communication, stakeholder alignment
- solutions-architect: system design, customer engagement, technical strategy
- security-engineer: threat modeling, compliance, secure architecture
Reorder experience bullets and project selection to match the archetype's priorities.
If missing, infer from job title and requirements.

AI FINGERPRINT AVOIDANCE:
${AI_FINGERPRINT_BANNED}

SUMMARY SECTION:
3-4 sentences max. Lead with years of experience + domain expertise. Weave in 3-4 key JD keywords naturally. Do NOT name the specific company or state you are applying for a specific role — keep the summary professional and broadly applicable so it reads like a confident self-description, not a cover letter.

CORE COMPETENCIES SECTION:
Generate 6-8 keyword phrases drawn directly from JD requirements that the candidate genuinely possesses.
These appear as a compact grid right after the Summary for the "6-second recruiter scan."
Use exact JD terminology. Only include competencies the candidate can back up with real experience.
Example: ["Distributed Systems", "Kubernetes & Docker", "CI/CD Pipelines", "Python", "System Design", "Performance Optimization"]

SKILLS SECTION:
Group by category (Languages, Frameworks, Tools, Databases, Cloud). List JD-required skills first. Remove irrelevant skills.

PUBLICATIONS & CERTIFICATIONS:
Include only if relevant to the role. Omit irrelevant ones to save space.

GAP ANALYSIS:
Strengthen bullets matching JD; reframe experience using JD vocabulary; NEVER fabricate; de-emphasize irrelevant experience.

Keep it concise: 1 page preferred, 2 pages only for 10+ years experience.

Return ONLY valid JSON:

{
  "name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "linkedin": "string",
  "github": "string",
  "website": "string",
  "twitter": "string",
  "pinterest": "string",
  "summary": "string",
  "coreCompetencies": ["string (6-8 JD keyword phrases for quick-scan grid)"],
  "experiences": [{"company":"string","title":"string (FLIPPED format)","startDate":"YYYY-MM","endDate":"YYYY-MM|Present","bullets":"string[]"}],
  "educations": [{"school":"string","degree":"string","field":"string","endDate":"YYYY","gpa":"string"}],
  "projects": [{"name":"string","description":"string","url":"string"}],
  "skills": {"languages":"string[]","frameworks":"string[]","tools":"string[]","databases":"string[]","cloud":"string[]"},
  "publications": [{"title":"string","publisher":"string","date":"YYYY","url":"string","doi":"string","description":"string"}],
  "certifications": [{"name":"string","issuer":"string","date":"YYYY","expiryDate":"string","credentialId":"string","url":"string"}]
}

Candidate Profile:
${JSON.stringify(compactProfile(profile))}

Target Job:
${JSON.stringify(jobAnalysis)}`, { timeoutMs: 600_000, skill: "resume-writer", model: options?.model });
}
