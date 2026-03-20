import { askJson } from "../client";

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

interface JobAnalysis {
  title: string;
  company: string;
  skills: string[];
  requirements: RequirementMapping[];
  atsKeywords: ATSKeywords;
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
export async function analyzeJobDescription(description: string): Promise<JobAnalysis> {
  return askJson(`Analyze the job description and extract structured data.

REQUIREMENT CLASSIFICATION — classify each requirement as:
- "direct": common/standard skill likely found on matching resumes
- "bridge": satisfiable by transferable experience; include bridgeNote (explain the transfer) and confidence (high/medium/low)
- "gap": highly specific; unlikely to be claimed without direct experience

ATS KEYWORD EXTRACTION:
Extract top JD keywords by type for verbatim resume matching (use exact JD terms, not synonyms).

SPONSORSHIP / WORK AUTHORIZATION:
Check the entire JD for visa sponsorship or work authorization language. Classify as:
- "unavailable": explicitly states no sponsorship or requires citizenship/Green Card/permanent residency
- "available": explicitly offers visa sponsorship
- "unspecified": no mention either way
If unavailable or available, include sponsorshipNote quoting/paraphrasing the relevant text.

Return ONLY valid JSON:

{
  "title": "string",
  "company": "string",
  "skills": "string[]",
  "requirements": [
    {"requirement":"string","classification":"direct|bridge|gap","confidence":"high|medium|low","bridgeNote":"string"}
  ],
  "atsKeywords": {"technical":"string[]","domain":"string[]","tools":"string[]","softSkills":"string[]"},
  "seniority": "junior|mid|senior|staff|principal",
  "sponsorship": "available|unavailable|unspecified",
  "sponsorshipNote": "string (only if available or unavailable)",
  "summary": "string"
}

Job description:
${description}`);
}
