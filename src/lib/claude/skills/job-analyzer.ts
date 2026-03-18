import { askJson } from "../client";

interface JobAnalysis {
  title: string;
  company: string;
  skills: string[];
  requirements: string[];
  seniority: string;
  summary: string;
}

/**
 * Skill: Job Analyzer
 *
 * Analyzes a job description and extracts structured data:
 * title, company, required skills, seniority, and summary.
 */
export async function analyzeJobDescription(description: string): Promise<JobAnalysis> {
  return askJson(`Analyze the following job description and extract structured data. Return ONLY valid JSON:

{
  "title": "Job Title",
  "company": "Company Name",
  "skills": ["required skill 1", "required skill 2"],
  "requirements": ["key requirement 1", "key requirement 2"],
  "seniority": "junior|mid|senior|staff|principal",
  "summary": "Brief summary of the role"
}

Job description:
${description}`);
}
