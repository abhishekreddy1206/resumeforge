import { askJson } from "../client";
import type { ResumeData } from "@/lib/types";

/**
 * Skill: Resume Writer (ATS-Optimized)
 *
 * Generates a tailored, ATS-optimized resume given a candidate profile
 * and a target job. Follows the resume-writer skill guidelines:
 * - Strong action verbs, quantified impact
 * - ATS keyword mirroring from job description
 * - Gap analysis (strengthen matching, reframe relevant, never fabricate)
 * - 1 page preferred, 2 pages for 10+ years
 */
export async function generateTailoredResume(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>
) {
  return askJson<ResumeData>(`You are an expert ATS-optimized resume writer for software engineers. Given the candidate's profile and the target job, create a tailored resume following these rules:

BULLET POINT PRINCIPLES:
- Lead with a strong ACTION VERB (Engineered, Reduced, Launched, Spearheaded, Architected, Automated, Deployed, Migrated, Optimized, Scaled)
- Include QUANTIFIED IMPACT wherever possible: %, $, time saved, team size, requests/sec
- Mirror EXACT KEYWORDS from the job description (ATS systems match literally)
- Keep to 1-2 lines per bullet; max 5-6 bullets per role
- Most recent role gets the most bullets; older roles get 2-3

SUMMARY SECTION:
- 3-4 sentences max
- Name the target role explicitly
- Lead with years of experience + domain
- Include 3-4 of the most important JD keywords naturally

SKILLS SECTION:
- Group by category (Languages, Frameworks, Tools, Databases, Cloud)
- List JD-required skills FIRST
- Remove skills clearly irrelevant to this role

GAP ANALYSIS:
- Strengthen bullets that already match JD requirements
- Reframe relevant experience that isn't framed well
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
      "title": "Title",
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
${JSON.stringify(jobAnalysis, null, 2)}`);
}
