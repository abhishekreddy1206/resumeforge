import { createHash } from "crypto";
import { generateResumeFromPlan } from "@/lib/claude/skills/resume-writer";
import { evaluateResumeArtifact } from "@/lib/claude/skills/resume-critic";
import { planResumeOptimization } from "@/lib/claude/skills/resume-planner";
import type {
  JobAnalysisData,
  ResumeArtifactEvaluation,
  ResumeData,
  ResumeOptimizationPlan,
  ResumeValidationIssue,
  SourceProfileSnapshot,
} from "@/lib/types";
import { safeJsonParse } from "@/lib/utils/json";
import { createLogger } from "@/lib/logger";

const log = createLogger("resume-quality");
const QUALITY_EVALUATION_VERSION = 2;

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function makeDeterministicHash(...parts: Array<string | null | undefined>): string {
  const payload = parts.map((part) => normalizeText(part)).join("|");
  return createHash("sha1").update(payload).digest("hex").slice(0, 12);
}

function countWords(text: string | null | undefined): number {
  return (text || "").trim().split(/\s+/u).filter(Boolean).length;
}

function countSentences(text: string | null | undefined): number {
  return (text || "")
    .split(/[.!?]+/u)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function normalizeKeyword(keyword: string): string {
  return normalizeText(keyword).replace(/\s+/g, " ");
}

function flattenJobKeywords(jobAnalysis: JobAnalysisData): string[] {
  const buckets = [
    ...(jobAnalysis.skills || []),
    ...(jobAnalysis.atsKeywords?.technical || []),
    ...(jobAnalysis.atsKeywords?.domain || []),
    ...(jobAnalysis.atsKeywords?.tools || []),
    ...(jobAnalysis.atsKeywords?.softSkills || []),
  ];
  return Array.from(
    new Set(
      buckets
        .map((keyword) => normalizeKeyword(keyword))
        .filter((keyword) => keyword.length >= 3)
    )
  );
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAllowedSkillTerms(snapshot: SourceProfileSnapshot, jobAnalysis: JobAnalysisData): Set<string> {
  const terms = new Set<string>();
  for (const skill of snapshot.skills) {
    terms.add(normalizeKeyword(skill.name));
  }
  for (const exp of snapshot.experiences) {
    for (const skill of exp.skills || []) {
      terms.add(normalizeKeyword(skill));
    }
  }
  for (const project of snapshot.projects) {
    for (const skill of project.skills || []) {
      terms.add(normalizeKeyword(skill));
    }
  }
  for (const entry of jobAnalysis.terminologyMap || []) {
    terms.add(normalizeKeyword(entry.jdTerm));
    for (const synonym of entry.resumeSynonyms || []) {
      terms.add(normalizeKeyword(synonym));
    }
  }
  return terms;
}

function buildEvidenceCorpus(snapshot: SourceProfileSnapshot): string {
  return normalizeText(
    JSON.stringify({
      summary: snapshot.summary,
      experiences: snapshot.experiences,
      projects: snapshot.projects,
      skills: snapshot.skills,
      publications: snapshot.publications,
      certifications: snapshot.certifications,
      recommendations: snapshot.recommendations,
    })
  );
}

function isSupportedSkillTerm(term: string, snapshot: SourceProfileSnapshot, jobAnalysis: JobAnalysisData): boolean {
  const normalized = normalizeKeyword(term);
  if (!normalized) return true;

  const allowed = buildAllowedSkillTerms(snapshot, jobAnalysis);
  if (allowed.has(normalized)) return true;

  const corpus = buildEvidenceCorpus(snapshot);
  if (corpus.includes(normalized)) return true;

  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  return tokens.length > 1 && tokens.every((token) => corpus.includes(token));
}

function issue(
  code: string,
  message: string,
  severity: "hard" | "soft",
  sourceKey?: string
): ResumeValidationIssue {
  return { code, message, severity, sourceKey };
}

function getSupportSectionCount(data: ResumeData): number {
  let count = 0;
  if (data.publications?.length) count += 1;
  if (data.certifications?.length) count += 1;
  if (data.recommendations?.length) count += 1;
  return count;
}

function inferPagePressure(data: ResumeData): "low" | "medium" | "high" {
  const bulletCount = (data.experiences || []).reduce((sum, exp) => sum + (exp.bullets?.length || 0), 0);
  const totalWords =
    countWords(data.summary) +
    (data.experiences || []).reduce((sum, exp) => sum + exp.bullets.reduce((inner, bullet) => inner + countWords(bullet), 0), 0) +
    (data.projects || []).reduce((sum, project) => sum + countWords(project.description), 0) +
    (data.recommendations || []).reduce((sum, rec) => sum + countWords(rec.text), 0);

  if (
    bulletCount > 20 ||
    totalWords > 650 ||
    (data.experiences?.length || 0) > 5 ||
    (data.projects?.length || 0) > 2 ||
    getSupportSectionCount(data) > 1
  ) {
    return "high";
  }

  if (bulletCount > 16 || totalWords > 520) {
    return "medium";
  }

  return "low";
}

export function createSourceProfileSnapshot(profile: Record<string, unknown>): SourceProfileSnapshot {
  const recommendations = safeJsonParse<Array<Record<string, unknown>>>(
    profile.recommendations,
    Array.isArray(profile.recommendations) ? (profile.recommendations as Array<Record<string, unknown>>) : []
  );

  const additionalEmails = safeJsonParse<string[]>(
    profile.additionalEmails,
    Array.isArray(profile.additionalEmails) ? (profile.additionalEmails as string[]) : []
  );

  return {
    name: String(profile.name || ""),
    email: (profile.email as string | null | undefined) ?? null,
    additionalEmails,
    phone: (profile.phone as string | null | undefined) ?? null,
    location: (profile.location as string | null | undefined) ?? null,
    summary: (profile.summary as string | null | undefined) ?? null,
    linkedin: (profile.linkedin as string | null | undefined) ?? null,
    github: (profile.github as string | null | undefined) ?? null,
    website: (profile.website as string | null | undefined) ?? null,
    twitter: (profile.twitter as string | null | undefined) ?? null,
    pinterest: (profile.pinterest as string | null | undefined) ?? null,
    experiences: ((profile.experiences as Array<Record<string, unknown>>) || []).map((experience) => ({
      id: (experience.id as string | undefined) ?? undefined,
      sourceKey:
        typeof experience.id === "string" && experience.id
          ? `exp:${experience.id}`
          : `exp:${makeDeterministicHash(
              experience.company as string,
              experience.title as string,
              experience.startDate as string,
              experience.endDate as string
            )}`,
      company: String(experience.company || ""),
      title: String(experience.title || ""),
      startDate: String(experience.startDate || ""),
      endDate: (experience.endDate as string | null | undefined) ?? null,
      current: Boolean(experience.current),
      bullets: safeJsonParse<string[]>(
        experience.bullets,
        Array.isArray(experience.bullets) ? (experience.bullets as string[]) : []
      ),
      skills: safeJsonParse<string[]>(
        experience.skills,
        Array.isArray(experience.skills) ? (experience.skills as string[]) : []
      ),
    })),
    educations: ((profile.educations as Array<Record<string, unknown>>) || []).map((education) => ({
      id: (education.id as string | undefined) ?? undefined,
      sourceKey:
        typeof education.id === "string" && education.id
          ? `edu:${education.id}`
          : `edu:${makeDeterministicHash(
              education.school as string,
              education.degree as string,
              education.field as string
            )}`,
      school: String(education.school || ""),
      degree: String(education.degree || ""),
      field: (education.field as string | null | undefined) ?? null,
      startDate: (education.startDate as string | null | undefined) ?? null,
      endDate: (education.endDate as string | null | undefined) ?? null,
      gpa: (education.gpa as string | null | undefined) ?? null,
    })),
    projects: ((profile.projects as Array<Record<string, unknown>>) || []).map((project) => ({
      id: (project.id as string | undefined) ?? undefined,
      sourceKey:
        typeof project.id === "string" && project.id
          ? `project:${project.id}`
          : `project:${makeDeterministicHash(
              project.name as string,
              project.url as string,
              project.description as string
            )}`,
      name: String(project.name || ""),
      description: (project.description as string | null | undefined) ?? null,
      url: (project.url as string | null | undefined) ?? null,
      skills: safeJsonParse<string[]>(
        project.skills,
        Array.isArray(project.skills) ? (project.skills as string[]) : []
      ),
    })),
    skills: ((profile.skills as Array<Record<string, unknown>>) || []).map((skill) => ({
      id: (skill.id as string | undefined) ?? undefined,
      sourceKey:
        typeof skill.id === "string" && skill.id
          ? `skill:${skill.id}`
          : `skill:${makeDeterministicHash(skill.name as string, skill.category as string)}`,
      name: String(skill.name || ""),
      category: String(skill.category || "other"),
    })),
    publications: ((profile.publications as Array<Record<string, unknown>>) || []).map((publication) => ({
      id: (publication.id as string | undefined) ?? undefined,
      sourceKey:
        typeof publication.id === "string" && publication.id
          ? `pub:${publication.id}`
          : `pub:${makeDeterministicHash(
              publication.title as string,
              publication.publisher as string,
              publication.date as string
            )}`,
      title: String(publication.title || ""),
      publisher: (publication.publisher as string | null | undefined) ?? null,
      date: (publication.date as string | null | undefined) ?? null,
      url: (publication.url as string | null | undefined) ?? null,
      doi: (publication.doi as string | null | undefined) ?? null,
      description: (publication.description as string | null | undefined) ?? null,
    })),
    certifications: ((profile.certifications as Array<Record<string, unknown>>) || []).map((certification) => ({
      id: (certification.id as string | undefined) ?? undefined,
      sourceKey:
        typeof certification.id === "string" && certification.id
          ? `cert:${certification.id}`
          : `cert:${makeDeterministicHash(
              certification.name as string,
              certification.issuer as string,
              certification.credentialId as string
            )}`,
      name: String(certification.name || ""),
      issuer: (certification.issuer as string | null | undefined) ?? null,
      date: (certification.date as string | null | undefined) ?? null,
      expiryDate: (certification.expiryDate as string | null | undefined) ?? null,
      credentialId: (certification.credentialId as string | null | undefined) ?? null,
      url: (certification.url as string | null | undefined) ?? null,
    })),
    recommendations: recommendations.map((recommendation) => ({
      sourceKey: `rec:${makeDeterministicHash(
        recommendation.recommenderName as string,
        recommendation.recommenderTitle as string,
        recommendation.text as string
      )}`,
      recommenderName: String(recommendation.recommenderName || ""),
      recommenderTitle: (recommendation.recommenderTitle as string | null | undefined) ?? null,
      relationship: (recommendation.relationship as string | null | undefined) ?? null,
      text: String(recommendation.text || ""),
      linkedinUrl: (recommendation.linkedinUrl as string | null | undefined) ?? null,
    })),
  };
}

export function buildJobAnalysisFromRecord(job: Record<string, unknown>): JobAnalysisData {
  return {
    title: String(job.title || ""),
    company: String(job.company || ""),
    description: String(job.description || ""),
    skills: safeJsonParse<string[]>(job.skills, []),
    requirements: safeJsonParse(job.requirements, []),
    atsKeywords: safeJsonParse(job.atsKeywords, {}),
    terminologyMap: safeJsonParse(job.terminologyMap, []),
    roleArchetype: (job.roleArchetype as string | null | undefined) ?? null,
    seniority: (job.seniority as string | null | undefined) ?? null,
  };
}

function buildSnapshotMaps(snapshot: SourceProfileSnapshot) {
  return {
    experiences: new Map(snapshot.experiences.map((item) => [item.sourceKey, item])),
    projects: new Map(snapshot.projects.map((item) => [item.sourceKey, item])),
    publications: new Map(snapshot.publications.map((item) => [item.sourceKey, item])),
    certifications: new Map(snapshot.certifications.map((item) => [item.sourceKey, item])),
    recommendations: new Map(snapshot.recommendations.map((item) => [item.sourceKey, item])),
  };
}

export function validateOptimizationPlan(
  plan: ResumeOptimizationPlan,
  snapshot: SourceProfileSnapshot
): ResumeValidationIssue[] {
  const issues: ResumeValidationIssue[] = [];
  const maps = buildSnapshotMaps(snapshot);

  if (plan.coreCompetencies.length < 5 || plan.coreCompetencies.length > 6) {
    issues.push(
      issue(
        "core_competency_budget",
        "Core competencies should contain 5 to 6 items for v2 resumes.",
        "soft"
      )
    );
  }

  if (plan.experiences.length > 5) {
    issues.push(issue("experience_budget", "Resume plan selects more than 5 roles.", "soft"));
  }

  if (plan.projects.length > 2) {
    issues.push(issue("project_budget", "Resume plan selects more than 2 projects.", "soft"));
  }

  const supportSectionCount =
    Number(plan.publications.length > 0) +
    Number(plan.certifications.length > 0) +
    Number(plan.recommendations.length > 0);
  if (supportSectionCount > 1) {
    issues.push(
      issue(
        "support_section_budget",
        "Plan selects more than one supporting section by default.",
        "soft"
      )
    );
  }

  for (const experience of plan.experiences) {
    const source = maps.experiences.get(experience.sourceKey);
    if (!source) {
      issues.push(
        issue(
          "missing_experience_source_key",
          `Plan references unknown experience source key ${experience.sourceKey}.`,
          "hard",
          experience.sourceKey
        )
      );
      continue;
    }

    if (experience.officialTitle !== source.title) {
      issues.push(
        issue(
          "official_title_mismatch",
          `Official title for ${experience.sourceKey} must exactly match the source title.`,
          "hard",
          experience.sourceKey
        )
      );
    }

    if (experience.focusClause && countWords(experience.focusClause) > 4) {
      issues.push(
        issue(
          "focus_clause_too_long",
          `Focus clause for ${experience.sourceKey} exceeds 4 words.`,
          "hard",
          experience.sourceKey
        )
      );
    }

    if (experience.selectedBulletIndices.some((index) => index < 0 || index >= source.bullets.length)) {
      issues.push(
        issue(
          "invalid_bullet_reference",
          `Plan references a bullet outside the source range for ${experience.sourceKey}.`,
          "hard",
          experience.sourceKey
        )
      );
    }
  }

  for (const project of plan.projects) {
    if (!maps.projects.has(project.sourceKey)) {
      issues.push(
        issue("missing_project_source_key", `Plan references unknown project ${project.sourceKey}.`, "hard", project.sourceKey)
      );
    }
  }

  for (const publication of plan.publications) {
    if (!maps.publications.has(publication.sourceKey)) {
      issues.push(
        issue(
          "missing_publication_source_key",
          `Plan references unknown publication ${publication.sourceKey}.`,
          "hard",
          publication.sourceKey
        )
      );
    }
  }

  for (const certification of plan.certifications) {
    if (!maps.certifications.has(certification.sourceKey)) {
      issues.push(
        issue(
          "missing_certification_source_key",
          `Plan references unknown certification ${certification.sourceKey}.`,
          "hard",
          certification.sourceKey
        )
      );
    }
  }

  for (const recommendation of plan.recommendations) {
    if (!maps.recommendations.has(recommendation.sourceKey)) {
      issues.push(
        issue(
          "missing_recommendation_source_key",
          `Plan references unknown recommendation ${recommendation.sourceKey}.`,
          "hard",
          recommendation.sourceKey
        )
      );
    }
    if (countWords(recommendation.snippet) > 40) {
      issues.push(
        issue(
          "recommendation_snippet_too_long",
          `Recommendation snippet for ${recommendation.sourceKey} exceeds 40 words.`,
          "soft",
          recommendation.sourceKey
        )
      );
    }
  }

  return uniqueBy(issues, (entry) => `${entry.severity}:${entry.code}:${entry.sourceKey ?? ""}:${entry.message}`);
}

export function validateResumeData(
  resumeData: ResumeData,
  snapshot: SourceProfileSnapshot,
  plan: ResumeOptimizationPlan,
  jobAnalysis: JobAnalysisData
): ResumeValidationIssue[] {
  const issues: ResumeValidationIssue[] = [];
  const maps = buildSnapshotMaps(snapshot);
  const planExperienceKeys = new Set(plan.experiences.map((item) => item.sourceKey));
  const planProjectKeys = new Set(plan.projects.map((item) => item.sourceKey));
  const planPublicationKeys = new Set(plan.publications.map((item) => item.sourceKey));
  const planCertificationKeys = new Set(plan.certifications.map((item) => item.sourceKey));
  const planRecommendationKeys = new Set(plan.recommendations.map((item) => item.sourceKey));

  const summaryWordCount = countWords(resumeData.summary);
  const summarySentenceCount = countSentences(resumeData.summary);
  if (summaryWordCount > 70 || summarySentenceCount > 3) {
    issues.push(issue("summary_budget", "Summary exceeds the v2 target budget.", "soft"));
  }

  if ((resumeData.experiences?.length || 0) > 5) {
    issues.push(issue("experience_budget", "Resume includes more than 5 roles.", "soft"));
  }

  (resumeData.experiences || []).forEach((experience, index) => {
    if (!experience.sourceKey || !maps.experiences.has(experience.sourceKey)) {
      issues.push(
        issue(
          "broken_experience_source_key",
          "Resume experience is missing a valid source key.",
          "hard",
          experience.sourceKey
        )
      );
      return;
    }

    if (!planExperienceKeys.has(experience.sourceKey)) {
      issues.push(
        issue(
          "unplanned_experience",
          `Resume includes experience ${experience.sourceKey} that was not selected by the plan.`,
          "hard",
          experience.sourceKey
        )
      );
    }

    const source = maps.experiences.get(experience.sourceKey)!;
    if (experience.company !== source.company) {
      issues.push(
        issue(
          "invented_company",
          `Resume changed company name for ${experience.sourceKey}.`,
          "hard",
          experience.sourceKey
        )
      );
    }

    const [leftTitle] = experience.title.split("|").map((part) => part.trim());
    if (leftTitle !== source.title) {
      issues.push(
        issue(
          "title_left_side_mismatch",
          `Left side of title must match source title for ${experience.sourceKey}.`,
          "hard",
          experience.sourceKey
        )
      );
    }

    const bulletCount = experience.bullets?.length || 0;
    const maxBullets = index < 2 ? 6 : 4;
    const minBullets = index < 2 ? 4 : 2;
    if (bulletCount > maxBullets || bulletCount < minBullets) {
      issues.push(
        issue(
          "bullet_budget",
          `Experience ${experience.sourceKey} falls outside the bullet budget.`,
          "soft",
          experience.sourceKey
        )
      );
    }
  });

  if ((resumeData.projects?.length || 0) > 2) {
    issues.push(issue("project_budget", "Resume includes more than 2 projects.", "soft"));
  }

  for (const project of resumeData.projects || []) {
    if (!project.sourceKey || !maps.projects.has(project.sourceKey)) {
      issues.push(issue("broken_project_source_key", "Resume project is missing a valid source key.", "hard", project.sourceKey));
      continue;
    }
    if (!planProjectKeys.has(project.sourceKey)) {
      issues.push(issue("unplanned_project", `Resume includes project ${project.sourceKey} outside the plan.`, "hard", project.sourceKey));
    }
    const source = maps.projects.get(project.sourceKey)!;
    if (project.name !== source.name) {
      issues.push(issue("invented_project_name", `Resume changed project name for ${project.sourceKey}.`, "hard", project.sourceKey));
    }
  }

  for (const publication of resumeData.publications || []) {
    if (!publication.sourceKey || !maps.publications.has(publication.sourceKey)) {
      issues.push(issue("broken_publication_source_key", "Resume publication is missing a valid source key.", "hard", publication.sourceKey));
      continue;
    }
    if (!planPublicationKeys.has(publication.sourceKey)) {
      issues.push(issue("unplanned_publication", `Resume includes publication ${publication.sourceKey} outside the plan.`, "hard", publication.sourceKey));
    }
    const source = maps.publications.get(publication.sourceKey)!;
    if (publication.title !== source.title) {
      issues.push(issue("invented_publication_name", `Resume changed publication title for ${publication.sourceKey}.`, "hard", publication.sourceKey));
    }
  }

  for (const certification of resumeData.certifications || []) {
    if (!certification.sourceKey || !maps.certifications.has(certification.sourceKey)) {
      issues.push(issue("broken_certification_source_key", "Resume certification is missing a valid source key.", "hard", certification.sourceKey));
      continue;
    }
    if (!planCertificationKeys.has(certification.sourceKey)) {
      issues.push(issue("unplanned_certification", `Resume includes certification ${certification.sourceKey} outside the plan.`, "hard", certification.sourceKey));
    }
    const source = maps.certifications.get(certification.sourceKey)!;
    if (certification.name !== source.name) {
      issues.push(issue("invented_certification_name", `Resume changed certification name for ${certification.sourceKey}.`, "hard", certification.sourceKey));
    }
  }

  for (const recommendation of resumeData.recommendations || []) {
    if (!recommendation.sourceKey || !maps.recommendations.has(recommendation.sourceKey)) {
      issues.push(issue("broken_recommendation_source_key", "Resume recommendation is missing a valid source key.", "hard", recommendation.sourceKey));
      continue;
    }
    if (!planRecommendationKeys.has(recommendation.sourceKey)) {
      issues.push(issue("unplanned_recommendation", `Resume includes recommendation ${recommendation.sourceKey} outside the plan.`, "hard", recommendation.sourceKey));
    }
    if (countWords(recommendation.text) > 40) {
      issues.push(issue("recommendation_length", "Recommendation snippet exceeds 40 words.", "soft", recommendation.sourceKey));
    }
  }

  if (getSupportSectionCount(resumeData) > 1) {
    issues.push(issue("support_section_budget", "Resume uses more than one supporting section.", "soft"));
  }

  const flattenedSkills = Object.values(resumeData.skills || {}).flat();
  for (const skill of flattenedSkills) {
    if (!isSupportedSkillTerm(skill, snapshot, jobAnalysis)) {
      issues.push(issue("unsupported_skill", `Skill "${skill}" is not grounded in source evidence.`, "hard"));
    }
  }

  const keywordBuckets = [
    resumeData.summary || "",
    ...(resumeData.coreCompetencies || []),
    ...flattenedSkills,
  ]
    .map((entry) => normalizeKeyword(entry))
    .join(" ");
  const repeatedKeywords = flattenJobKeywords(jobAnalysis).filter((keyword) => {
    const matches = keywordBuckets.match(new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
    return (matches?.length || 0) >= 3;
  });
  if (repeatedKeywords.length > 0) {
    issues.push(
      issue(
        "keyword_stuffing",
        `Repeated JD keyword stuffing detected: ${repeatedKeywords.slice(0, 4).join(", ")}.`,
        "soft"
      )
    );
  }

  const bullets = (resumeData.experiences || []).flatMap((experience) => experience.bullets || []);
  const bulletsWithMetrics = bullets.filter((bullet) => /\d|%|\$|x\b|ms\b|sec\b|seconds?\b|minutes?\b|hours?\b/i.test(bullet)).length;
  if (bullets.length >= 4 && bulletsWithMetrics / bullets.length < 0.25) {
    issues.push(issue("low_metric_density", "Resume bullets have low metric density.", "soft"));
  }

  const normalizedBullets = bullets.map((bullet) => normalizeKeyword(bullet));
  const redundantBulletSet = new Set<string>();
  for (let index = 0; index < normalizedBullets.length; index += 1) {
    for (let inner = index + 1; inner < normalizedBullets.length; inner += 1) {
      if (
        normalizedBullets[index] &&
        normalizedBullets[index] === normalizedBullets[inner]
      ) {
        redundantBulletSet.add(normalizedBullets[index]);
      }
    }
  }
  if (redundantBulletSet.size > 0) {
    issues.push(issue("redundant_bullets", "Resume contains redundant bullet phrasing.", "soft"));
  }

  if (inferPagePressure(resumeData) === "high") {
    issues.push(issue("page_budget_overflow", "Resume likely exceeds the intended page budget.", "soft"));
  }

  return uniqueBy(issues, (entry) => `${entry.severity}:${entry.code}:${entry.sourceKey ?? ""}:${entry.message}`);
}

export function finalizeResumeArtifactEvaluation(
  baseEvaluation: ResumeArtifactEvaluation,
  validationIssues: ResumeValidationIssue[],
  resumeData: ResumeData
): ResumeArtifactEvaluation {
  const hardBlockers = validationIssues.filter((entry) => entry.severity === "hard");
  const warnings = validationIssues.filter((entry) => entry.severity === "soft");
  const dimensionMap = new Map(baseEvaluation.dimensions.map((dimension) => [dimension.dimension, dimension]));

  if (hardBlockers.length > 0) {
    const groundingScore = Math.max(
      0,
      (dimensionMap.get("grounding_integrity")?.score ?? 100) - hardBlockers.length * 25
    );
    dimensionMap.set("grounding_integrity", {
      dimension: "grounding_integrity",
      score: groundingScore,
      rationale:
        hardBlockers[0]?.message ||
        "Deterministic validation found grounding issues.",
    });
  }

  if (warnings.length > 0) {
    const concisionScore = Math.max(
      0,
      (dimensionMap.get("concision_space_use")?.score ?? 100) - warnings.length * 6
    );
    dimensionMap.set("concision_space_use", {
      dimension: "concision_space_use",
      score: concisionScore,
      rationale:
        warnings[0]?.message ||
        "Deterministic validation found space and verbosity issues.",
    });
  }

  const dimensions = Array.from(dimensionMap.values());
  const overallScore = Math.round(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / Math.max(dimensions.length, 1)
  );

  const bullets = (resumeData.experiences || []).flatMap((experience) => experience.bullets || []);
  const bulletsWithMetrics = bullets.filter((bullet) => /\d|%|\$/i.test(bullet)).length;
  const repeatedKeywordCount = warnings.filter((entry) => entry.code === "keyword_stuffing").length;

  return {
    version: QUALITY_EVALUATION_VERSION,
    overallScore: hardBlockers.length > 0 ? Math.min(overallScore, 60) : overallScore,
    dimensions,
    hardBlockers,
    warnings,
    verdict: hardBlockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs_review" : baseEvaluation.verdict,
    suggestedFixes: uniqueBy(
      [...baseEvaluation.suggestedFixes, ...validationIssues.map((entry) => entry.message)],
      (value) => value
    ).slice(0, 6),
    metrics: {
      summaryWordCount: countWords(resumeData.summary),
      summarySentenceCount: countSentences(resumeData.summary),
      experienceCount: resumeData.experiences?.length || 0,
      projectCount: resumeData.projects?.length || 0,
      supportSectionCount: getSupportSectionCount(resumeData),
      totalBulletCount: bullets.length,
      bulletsWithMetrics,
      repeatedKeywordCount,
      pagePressure: inferPagePressure(resumeData),
    },
  };
}

export interface ResumeBuildResult {
  sourceSnapshot: SourceProfileSnapshot;
  optimizationPlan: ResumeOptimizationPlan | null;
  resumeData: ResumeData | null;
  evaluation: ResumeArtifactEvaluation | null;
  hardBlockers: ResumeValidationIssue[];
  warnings: ResumeValidationIssue[];
  blockedStage: "planner" | "writer" | "evaluator" | null;
}

function formatValidationFeedback(issues: ResumeValidationIssue[]): string {
  return issues
    .map((entry) => `- [${entry.severity}] ${entry.code}: ${entry.message}`)
    .join("\n");
}

export async function buildResumeQualityVersion(params: {
  profile: Record<string, unknown>;
  jobAnalysis: JobAnalysisData;
  matchResult: Record<string, unknown>;
  model?: string;
}): Promise<ResumeBuildResult> {
  const sourceSnapshot = createSourceProfileSnapshot(params.profile);

  let optimizationPlan = await planResumeOptimization(
    sourceSnapshot,
    params.jobAnalysis,
    params.matchResult,
    { model: params.model }
  );

  let planIssues = validateOptimizationPlan(optimizationPlan, sourceSnapshot);
  if (planIssues.some((entry) => entry.severity === "hard")) {
    optimizationPlan = await planResumeOptimization(
      sourceSnapshot,
      params.jobAnalysis,
      params.matchResult,
      {
        model: params.model,
        validatorFeedback: formatValidationFeedback(planIssues),
      }
    );
    planIssues = validateOptimizationPlan(optimizationPlan, sourceSnapshot);
    if (planIssues.some((entry) => entry.severity === "hard")) {
      return {
        sourceSnapshot,
        optimizationPlan,
        resumeData: null,
        evaluation: null,
        hardBlockers: planIssues.filter((entry) => entry.severity === "hard"),
        warnings: planIssues.filter((entry) => entry.severity === "soft"),
        blockedStage: "planner",
      };
    }
  }

  let resumeData = await generateResumeFromPlan(
    sourceSnapshot,
    params.jobAnalysis,
    params.matchResult,
    optimizationPlan,
    { model: params.model }
  );

  let resumeIssues = validateResumeData(resumeData, sourceSnapshot, optimizationPlan, params.jobAnalysis);
  if (resumeIssues.some((entry) => entry.severity === "hard")) {
    resumeData = await generateResumeFromPlan(
      sourceSnapshot,
      params.jobAnalysis,
      params.matchResult,
      optimizationPlan,
      {
        model: params.model,
        validatorFeedback: formatValidationFeedback(resumeIssues),
      }
    );
    resumeIssues = validateResumeData(resumeData, sourceSnapshot, optimizationPlan, params.jobAnalysis);
    if (resumeIssues.some((entry) => entry.severity === "hard")) {
      return {
        sourceSnapshot,
        optimizationPlan,
        resumeData,
        evaluation: null,
        hardBlockers: resumeIssues.filter((entry) => entry.severity === "hard"),
        warnings: [...planIssues, ...resumeIssues].filter((entry) => entry.severity === "soft"),
        blockedStage: "writer",
      };
    }
  }

  let llmEvaluation: ResumeArtifactEvaluation;
  try {
    llmEvaluation = await evaluateResumeArtifact(
      resumeData,
      sourceSnapshot,
      params.jobAnalysis,
      params.matchResult,
      optimizationPlan,
      { model: params.model }
    );
  } catch (err) {
    log.error("evaluator_failed", { error: err });
    return {
      sourceSnapshot,
      optimizationPlan,
      resumeData,
      evaluation: null,
      hardBlockers: [],
      warnings: [...planIssues, ...resumeIssues].filter((e) => e.severity === "soft"),
      blockedStage: "evaluator",
    };
  }

  const evaluation = finalizeResumeArtifactEvaluation(
    llmEvaluation,
    [...planIssues, ...resumeIssues],
    resumeData
  );

  return {
    sourceSnapshot,
    optimizationPlan,
    resumeData,
    evaluation,
    hardBlockers: evaluation.hardBlockers,
    warnings: evaluation.warnings,
    blockedStage: null,
  };
}

export function isV2ProfileVersion(version: { scoreVersion?: number | null } | null | undefined): boolean {
  return Boolean(version && version.scoreVersion === QUALITY_EVALUATION_VERSION);
}

export const RESUME_QUALITY_SCORE_VERSION = QUALITY_EVALUATION_VERSION;
