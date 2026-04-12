import { askJson, ROLE_ARCHETYPES } from "../client";

interface RequirementMapping {
  requirement: string;
  classification: "direct" | "bridge" | "gap";
  confidence?: "high" | "medium" | "low";
  bridgeNote?: string;
}

interface ATSKeywords {
  technical: string[];
  domain: string[];
  tools: string[];
  softSkills: string[];
}

interface TerminologyMapping {
  jdTerm: string;
  resumeSynonyms: string[];
}

interface JobAnalysis {
  title: string;
  company: string;
  skills: string[];
  requirements: RequirementMapping[];
  atsKeywords: ATSKeywords;
  terminologyMap: TerminologyMapping[];
  roleArchetype: string;
  seniority: string;
  sponsorship: "available" | "unavailable" | "unspecified";
  sponsorshipNote?: string;
  summary: string;
}

/**
 * Skill: Job Analyzer
 *
 * Analyzes a job description with deep requirement classification:
 * - Direct: exact match likely in candidate profile
 * - Bridge: transferable skill with confidence level
 * - Gap: cannot be claimed, needs acknowledgment
 *
 * Also extracts categorized ATS keywords for verbatim matching
 * and detects visa sponsorship / work authorization status.
 */
export async function analyzeJobDescription(description: string, options?: { model?: string }): Promise<JobAnalysis> {
  return askJson(`Analyze the job description and extract structured data.

REQUIREMENT CLASSIFICATION — classify each requirement as:
- "direct": common/standard skill likely found on matching resumes
- "bridge": satisfiable by transferable experience; include bridgeNote (explain the transfer) and confidence (high/medium/low)
- "gap": highly specific; unlikely to be claimed without direct experience

ATS KEYWORD EXTRACTION:
Extract top JD keywords by type for verbatim resume matching (use exact JD terms, not synonyms).

TERMINOLOGY MAPPING:
Map key JD terms to 2-4 resume synonyms candidates use. Skip generic terms.
Example: {"jdTerm": "Kubernetes", "resumeSynonyms": ["K8s", "container orchestration", "Kubernetes clusters"]}

ROLE ARCHETYPE CLASSIFICATION:
Classify the role into one primary archetype:
${ROLE_ARCHETYPES}

SPONSORSHIP / WORK AUTHORIZATION:
Scan full JD for sponsorship/work authorization. Classify:
- "unavailable": explicitly states no sponsorship or requires citizenship/Green Card/permanent residency
- "available": explicitly offers visa sponsorship
- "unspecified": no mention either way
If unavailable or available, include sponsorshipNote quoting/paraphrasing the relevant text.

COMPANY NAME NORMALIZATION:
Use parent brand name, not subsidiaries/legal entities. Strip Inc., LLC, Corp., Ltd., GmbH. If posted by staffing agency, use client company name.
Examples: "Google LLC" → "Google", "Meta Platforms, Inc." → "Meta"

Return ONLY valid JSON:

{
  "title": "string",
  "company": "string (normalized parent brand — see rules above)",
  "skills": "string[]",
  "requirements": [
    {"requirement":"string","classification":"direct|bridge|gap","confidence":"high|medium|low","bridgeNote":"string"}
  ],
  "atsKeywords": {"technical":"string[]","domain":"string[]","tools":"string[]","softSkills":"string[]"},
  "terminologyMap": [{"jdTerm":"string","resumeSynonyms":["string"]}],
  "roleArchetype": "backend-engineer|frontend-engineer|fullstack-engineer|platform-engineer|ml-engineer|data-engineer|engineering-manager|technical-pm|solutions-architect|security-engineer|other",
  "seniority": "junior|mid|senior|staff|principal",
  "sponsorship": "available|unavailable|unspecified",
  "sponsorshipNote": "string (only if available or unavailable)",
  "summary": "string"
}

Job description:
${description}`, { skill: "job-analyzer", model: options?.model });
}
