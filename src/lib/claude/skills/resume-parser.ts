import { askJson } from "../client";

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
  return askJson(`Parse the resume text into JSON. Return ONLY valid JSON with no extra text. All fields optional unless marked *.

Schema:
{
  name*, email, phone, location, summary, linkedin, github, website, twitter (x.com or twitter.com URL), pinterest,
  experiences: [{company*, title*, startDate* (YYYY-MM), endDate (YYYY-MM|null), current:bool, bullets:string[], skills:string[]}],
  educations: [{school*, degree*, field, startDate, endDate, gpa}],
  projects: [{name*, description, url, skills:string[]}],
  skills: [{name*, category* (language|framework|tool|database|cloud|soft)}],
  publications: [{title*, publisher, date (YYYY-MM), url, doi, description (≤100 words)}],
  certifications: [{name*, issuer, date (YYYY-MM), expiryDate, credentialId, url}],
  recommendations: [{recommenderName*, recommenderTitle, relationship, text*, linkedinUrl}]
}

Extract all skills mentioned (explicit + implicit from context). For experiences, extract skills used even if not listed.

Resume:
${text}`, { skill: "resume-parser" });
}
