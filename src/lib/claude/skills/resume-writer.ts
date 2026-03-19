import { askJson } from "../client";
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
  jobAnalysis: Record<string, any>
) {
  return askJson<ResumeData>(`You are an expert ATS-optimized resume writer. Given the candidate's profile and target job, create a tailored resume.

PRIORITY HIERARCHY (follow this order when making trade-offs):
Accuracy > Relevance > Impact > ATS > Brevity

BULLET POINT PRINCIPLES:
- Lead with a strong ACTION VERB (Engineered, Reduced, Launched, Spearheaded, Architected, Automated, Deployed, Migrated, Optimized, Scaled)
- Include QUANTIFIED IMPACT wherever possible: %, $, time saved, team size, requests/sec
- Mirror EXACT KEYWORDS from the job description (ATS systems match literally)
- Keep to 1-2 lines per bullet; max 5-6 bullets per role
- Most recent role gets the most bullets; older roles get 2-3

VERB DISCIPLINE:
- Use full-ownership verbs (Developed, Built, Designed, Led, Architected) ONLY for work the candidate independently owned
- Use collaborative verbs (Contributed to, Supported, Collaborated on, Assisted in) for shared or team efforts
- Never upgrade contribution level — if the candidate "contributed to" a project, do not write "Led" or "Spearheaded"
- Match verb strength to the actual scope described in the source bullets

FLIPPED POSITION FORMAT:
- For each experience, write the title as a JD-customized domain theme that highlights the most relevant aspect of the role
- Example: Instead of just "Software Engineer", write "Full-Stack Engineer — Payments & Checkout Systems" if applying to a fintech role
- The title should be the strongest JD customization lever while remaining truthful to the actual role

ATS KEYWORD STRATEGY:
- If the job analysis includes atsKeywords, target >=70% verbatim match rate across the resume
- Use exact terms from the JD, not synonyms (e.g., if JD says "Kubernetes", don't write "K8s")
- If the job analysis includes bridge requirements, use them: reframe transferable experience using the JD's vocabulary while being honest about what was actually used
- Skills section is the primary ATS surface — group names and ordering should reflect the JD

AI FINGERPRINT AVOIDANCE — the resume must read as human-written:
- BANNED WORDS: delve, tapestry, multifaceted, pivotal, synergy, paradigm, holistic, leverage (as verb), utilize, facilitate, foster, robust, comprehensive, cutting-edge, spearheading (gerund form), innovative, dynamic, proactive, results-driven, seasoned
- BANNED PHRASES: "proven track record", "passionate about", "at the intersection of", "plays a crucial role", "in today's fast-paced", "leveraging expertise"
- STRUCTURAL RULES:
  - No bullets ending with "-ing analysis" pattern (e.g., "improving efficiency" — instead write "improved efficiency by 30%")
  - Vary sentence length — mix short punchy bullets with longer detailed ones
  - Max 2 em-dashes per entire document
  - Use specific details, numbers, and named technologies rather than generic claims

SUMMARY SECTION:
- 3-4 sentences max
- Name the target role explicitly
- Lead with years of experience + domain
- Include 3-4 of the most important JD keywords naturally
- Avoid generic filler — every word should serve a purpose

SKILLS SECTION:
- Group by category (Languages, Frameworks, Tools, Databases, Cloud)
- List JD-required skills FIRST within each category
- Remove skills clearly irrelevant to this role

GAP ANALYSIS:
- Strengthen bullets that already match JD requirements
- Reframe relevant experience using JD vocabulary (reframe DURING writing, not after)
- NEVER fabricate experience or skills — only work with what exists
- De-emphasize or remove irrelevant experience

Keep it concise: 1 page preferred, 2 pages only for 10+ years experience.

Return ONLY valid JSON with this structure:

{
  "name": "Full Name",
  "email": "email",
  "phone": "phone",
  "location": "location",
  "linkedin": "linkedin url",
  "github": "github url",
  "website": "website url",
  "summary": "Tailored professional summary (2-3 sentences focused on the target role)",
  "experiences": [
    {
      "company": "Company",
      "title": "Domain-Themed Title (FLIPPED format)",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or Present",
      "bullets": ["tailored bullet 1", "tailored bullet 2"]
    }
  ],
  "educations": [
    {
      "school": "School",
      "degree": "Degree",
      "field": "Field",
      "endDate": "YYYY",
      "gpa": "GPA if impressive"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Tailored description",
      "url": "url"
    }
  ],
  "skills": {
    "languages": ["skill1", "skill2"],
    "frameworks": ["skill1", "skill2"],
    "tools": ["skill1", "skill2"],
    "databases": ["skill1", "skill2"],
    "cloud": ["skill1", "skill2"]
  }
}

Candidate Profile:
${JSON.stringify(profile, null, 2)}

Target Job:
${JSON.stringify(jobAnalysis, null, 2)}`, { timeoutMs: 240_000 });
}
