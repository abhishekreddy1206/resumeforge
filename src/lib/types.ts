export interface ResumeData {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  summary?: string;
  experiences?: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    bullets: string[];
  }>;
  educations?: Array<{
    school: string;
    degree: string;
    field?: string;
    endDate?: string;
    gpa?: string;
  }>;
  projects?: Array<{
    name: string;
    description?: string;
    url?: string;
  }>;
  skills?: Record<string, string[]>;
}
