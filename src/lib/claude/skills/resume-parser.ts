import { askJson } from "../client";
import { RESUME_PARSER_INSTRUCTIONS } from "./skill-prompts";

interface ParsedResume {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  twitter?: string;
  pinterest?: string;
  experiences: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    bullets: string[];
    skills: string[];
  }>;
  educations: Array<{
    school: string;
    degree: string;
    field?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
  }>;
  projects: Array<{
    name: string;
    description?: string;
    url?: string;
    skills: string[];
  }>;
  skills: Array<{
    name: string;
    category: string;
  }>;
  publications: Array<{
    title: string;
    publisher?: string;
    date?: string;
    url?: string;
    doi?: string;
    description?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer?: string;
    date?: string;
    expiryDate?: string;
    credentialId?: string;
    url?: string;
  }>;
  recommendations: Array<{
    recommenderName: string;
    recommenderTitle?: string;
    relationship?: string;
    text: string;
    linkedinUrl?: string;
  }>;
}

/**
 * Skill: Resume Parser
 *
 * Parses raw resume text into a structured profile.
 * Extracts contact info, experience, education, projects, and skills.
 */
export async function parseResumeText(text: string): Promise<ParsedResume> {
  return askJson(`${RESUME_PARSER_INSTRUCTIONS}

---

Resume:
${text}`, { skill: "resume-parser" });
}
