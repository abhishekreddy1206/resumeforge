import { askJson } from "../client";
import { JOB_ANALYSIS_INSTRUCTIONS, JOB_ANALYSIS_SCHEMA } from "./skill-prompts";

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
  return askJson(`${JOB_ANALYSIS_INSTRUCTIONS}

Return ONLY valid JSON:

${JOB_ANALYSIS_SCHEMA}

---

Job description:
${description}`, { skill: "job-analyzer", model: options?.model });
}
