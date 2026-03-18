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
  return askJson(`Analyze the following job description and extract structured data with deep requirement classification.

REQUIREMENT CLASSIFICATION:
For each requirement in the JD, classify it as:
- "direct": The requirement is a common/standard skill likely found on matching resumes
- "bridge": The requirement can be satisfied by transferable experience. Include a bridgeNote explaining the transfer (e.g., "PostgreSQL experience transfers to MySQL — relational DB fundamentals are shared") and a confidence level (high/medium/low)
- "gap": The requirement is highly specific and unlikely to be claimed without direct experience

ATS KEYWORD EXTRACTION:
Extract the top keywords from the JD, categorized by type. These will be used for verbatim matching in the resume. Focus on exact terms used in the JD, not synonyms.

SPONSORSHIP / WORK AUTHORIZATION:
Carefully check the ENTIRE job description for any mentions of:
- Visa sponsorship (H-1B, work visa, immigration sponsorship)
- Work authorization requirements (US citizen, permanent resident, Green Card, authorized to work)
- Phrases like "unable to sponsor", "will not sponsor", "no sponsorship", "must be authorized to work", "US persons only", "citizenship required", "Green Card holders only"
- OR positive phrases like "visa sponsorship available", "we sponsor H-1B"

Classify as:
- "unavailable": The posting explicitly states they do NOT sponsor work visas, or requires US citizenship / Green Card / permanent residency
- "available": The posting explicitly states they DO offer visa sponsorship
- "unspecified": No mention of sponsorship or work authorization either way

If "unavailable" or "available", include a "sponsorshipNote" quoting or paraphrasing the relevant text from the JD.

Return ONLY valid JSON:

{
  "title": "Job Title",
  "company": "Company Name",
  "skills": ["required skill 1", "required skill 2"],
  "requirements": [
    {
      "requirement": "5+ years Python experience",
      "classification": "direct"
    },
    {
      "requirement": "Experience with Kubernetes",
      "classification": "bridge",
      "confidence": "high",
      "bridgeNote": "Docker Swarm/ECS experience transfers — container orchestration fundamentals shared"
    },
    {
      "requirement": "Domain expertise in fintech payments",
      "classification": "gap"
    }
  ],
  "atsKeywords": {
    "technical": ["Python", "React", "microservices"],
    "domain": ["payments", "fintech", "compliance"],
    "tools": ["Kubernetes", "Terraform", "DataDog"],
    "softSkills": ["cross-functional", "mentorship", "stakeholder management"]
  },
  "seniority": "junior|mid|senior|staff|principal",
  "sponsorship": "available|unavailable|unspecified",
  "sponsorshipNote": "Quote or paraphrase from JD about sponsorship (only if available or unavailable)",
  "summary": "Brief summary of the role and what the ideal candidate looks like"
}

Job description:
${description}`);
}
