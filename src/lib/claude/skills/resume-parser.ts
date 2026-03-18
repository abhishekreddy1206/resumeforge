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
    proficiency: string;
  }>;
}

/**
 * Skill: Resume Parser
 *
 * Parses raw resume text into a structured profile.
 * Extracts contact info, experience, education, projects, and skills.
 */
export async function parseResumeText(text: string): Promise<ParsedResume> {
  return askJson(`Parse the following resume text and extract structured data. Return ONLY valid JSON with this exact structure:

{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "phone number",
  "location": "City, State",
  "summary": "Professional summary",
  "linkedin": "linkedin url if found",
  "github": "github url if found",
  "website": "personal website if found",
  "experiences": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or null if current",
      "current": false,
      "bullets": ["achievement 1", "achievement 2"],
      "skills": ["skill1", "skill2"]
    }
  ],
  "educations": [
    {
      "school": "University Name",
      "degree": "Degree Type",
      "field": "Field of Study",
      "startDate": "YYYY",
      "endDate": "YYYY",
      "gpa": "GPA if mentioned"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "url": "url if found",
      "skills": ["skill1", "skill2"]
    }
  ],
  "skills": [
    {
      "name": "Skill Name",
      "category": "language|framework|tool|database|cloud|soft",
      "proficiency": "beginner|intermediate|advanced|expert"
    }
  ]
}

Resume text:
${text}`);
}
