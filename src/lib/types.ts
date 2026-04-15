export interface ResumeData {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  twitter?: string;
  pinterest?: string;
  summary?: string;
  coreCompetencies?: string[];
  experiences?: Array<{
    sourceKey?: string;
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
    sourceKey?: string;
    name: string;
    description?: string;
    url?: string;
  }>;
  skills?: Record<string, string[]>;
  publications?: Array<{
    sourceKey?: string;
    title: string;
    publisher?: string;
    date?: string;
    url?: string;
    doi?: string;
    description?: string;
  }>;
  certifications?: Array<{
    sourceKey?: string;
    name: string;
    issuer?: string;
    date?: string;
    expiryDate?: string;
    credentialId?: string;
    url?: string;
  }>;
  recommendations?: Array<{
    sourceKey?: string;
    recommenderName: string;
    recommenderTitle?: string;
    relationship?: string;
    text: string;
    linkedinUrl?: string;
  }>;
}

export interface JobAnalysisData {
  title: string;
  company: string;
  description: string;
  skills: string[];
  requirements: Array<{
    requirement: string;
    classification?: "direct" | "bridge" | "gap";
    confidence?: "high" | "medium" | "low";
    bridgeNote?: string;
  }>;
  atsKeywords: {
    technical?: string[];
    domain?: string[];
    tools?: string[];
    softSkills?: string[];
  };
  terminologyMap: Array<{
    jdTerm: string;
    resumeSynonyms: string[];
  }>;
  roleArchetype?: string | null;
  seniority?: string | null;
}

export interface SourceBackedExperience {
  id?: string;
  sourceKey: string;
  company: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  current?: boolean;
  bullets: string[];
  skills: string[];
}

export interface SourceBackedEducation {
  id?: string;
  sourceKey: string;
  school: string;
  degree: string;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gpa?: string | null;
}

export interface SourceBackedProject {
  id?: string;
  sourceKey: string;
  name: string;
  description?: string | null;
  url?: string | null;
  skills: string[];
}

export interface SourceBackedSkill {
  id?: string;
  sourceKey: string;
  name: string;
  category: string;
}

export interface SourceBackedPublication {
  id?: string;
  sourceKey: string;
  title: string;
  publisher?: string | null;
  date?: string | null;
  url?: string | null;
  doi?: string | null;
  description?: string | null;
}

export interface SourceBackedCertification {
  id?: string;
  sourceKey: string;
  name: string;
  issuer?: string | null;
  date?: string | null;
  expiryDate?: string | null;
  credentialId?: string | null;
  url?: string | null;
}

export interface SourceBackedRecommendation {
  sourceKey: string;
  recommenderName: string;
  recommenderTitle?: string | null;
  relationship?: string | null;
  text: string;
  linkedinUrl?: string | null;
}

export interface SourceProfileSnapshot {
  name: string;
  email?: string | null;
  additionalEmails: string[];
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
  twitter?: string | null;
  pinterest?: string | null;
  experiences: SourceBackedExperience[];
  educations: SourceBackedEducation[];
  projects: SourceBackedProject[];
  skills: SourceBackedSkill[];
  publications: SourceBackedPublication[];
  certifications: SourceBackedCertification[];
  recommendations: SourceBackedRecommendation[];
}

export interface ResumePlanExperience {
  sourceKey: string;
  officialTitle: string;
  focusClause?: string;
  selectedBulletIndices: number[];
  rewrittenBullets: string[];
  rationale?: string;
}

export interface ResumePlanProject {
  sourceKey: string;
  selectedReason?: string;
  descriptionOverride?: string;
}

export interface ResumePlanPublication {
  sourceKey: string;
  selectedReason?: string;
}

export interface ResumePlanCertification {
  sourceKey: string;
  selectedReason?: string;
}

export interface ResumePlanRecommendation {
  sourceKey: string;
  snippet: string;
}

export interface ResumeOptimizationPlan {
  summaryAngle: string;
  summaryDraft?: string;
  coreCompetencies: string[];
  skills: Record<string, string[]>;
  experiences: ResumePlanExperience[];
  projects: ResumePlanProject[];
  publications: ResumePlanPublication[];
  certifications: ResumePlanCertification[];
  recommendations: ResumePlanRecommendation[];
  omissions: string[];
  pageBudgetRationale: string;
}

export interface ResumeValidationIssue {
  code: string;
  message: string;
  severity: "hard" | "soft";
  sourceKey?: string;
}

export interface ResumeArtifactDimension {
  dimension:
    | "grounding_integrity"
    | "requirement_coverage"
    | "evidence_strength"
    | "recruiter_scanability"
    | "ats_compatibility"
    | "concision_space_use";
  score: number;
  rationale: string;
}

export interface ResumeArtifactEvaluation {
  version: number;
  overallScore: number;
  dimensions: ResumeArtifactDimension[];
  hardBlockers: ResumeValidationIssue[];
  warnings: ResumeValidationIssue[];
  verdict: "ready" | "needs_review" | "blocked";
  suggestedFixes: string[];
  metrics: {
    summaryWordCount: number;
    summarySentenceCount: number;
    experienceCount: number;
    projectCount: number;
    supportSectionCount: number;
    totalBulletCount: number;
    bulletsWithMetrics: number;
    repeatedKeywordCount: number;
    pagePressure: "low" | "medium" | "high";
  };
}

export interface CoverLetterData {
  opening: string;
  bodyParagraphs: Array<{
    topic: string;
    content: string;
  }>;
  closing: string;
}
