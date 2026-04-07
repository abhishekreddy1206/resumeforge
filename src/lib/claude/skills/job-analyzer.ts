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
For each key technical/domain term in the JD, list 2-4 common resume synonyms a candidate might use instead.
This helps map the JD's language to equivalent terms a candidate would write on their resume.
Only map terms where there are meaningful alternative phrasings — skip generic terms.
Example: {"jdTerm": "Kubernetes", "resumeSynonyms": ["K8s", "container orchestration", "Kubernetes clusters"]}
Example: {"jdTerm": "CI/CD pipelines", "resumeSynonyms": ["continuous integration", "build automation", "deployment pipelines", "GitHub Actions"]}

ROLE ARCHETYPE CLASSIFICATION:
Classify the role into one primary archetype:
- "backend-engineer" — core services, APIs, distributed systems
- "frontend-engineer" — UI/UX, web apps, component systems
- "fullstack-engineer" — end-to-end feature development
- "platform-engineer" — infrastructure, DevOps, SRE, cloud
- "ml-engineer" — ML/AI systems, model training, MLOps
- "data-engineer" — data pipelines, ETL, warehousing
- "engineering-manager" — people management, technical leadership
- "technical-pm" — product management with technical depth
- "solutions-architect" — customer-facing technical design
- "security-engineer" — security, compliance, threat modeling
- "other" — if none fits clearly

SPONSORSHIP / WORK AUTHORIZATION:
Check the entire JD for visa sponsorship or work authorization language. Classify as:
- "unavailable": explicitly states no sponsorship or requires citizenship/Green Card/permanent residency
- "available": explicitly offers visa sponsorship
- "unspecified": no mention either way
If unavailable or available, include sponsorshipNote quoting/paraphrasing the relevant text.

COMPANY NAME NORMALIZATION:
Use the well-known parent/brand company name, not subsidiaries, legal entities, or recruiting agencies.
Examples: "Google LLC" → "Google", "Meta Platforms, Inc." → "Meta", "Amazon.com Services LLC" → "Amazon",
"Microsoft Corporation" → "Microsoft", "Apple Inc." → "Apple", "Alphabet Inc." → "Google".
Strip suffixes like Inc., LLC, Corp., Ltd., GmbH, etc.
If the job is posted by a staffing/recruiting agency on behalf of a client, use the client company name.

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
