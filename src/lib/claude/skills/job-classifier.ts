import { askJson } from "../client";
import {
  ROLE_CATEGORIES,
  TAXONOMY_VERSION,
  getCategoryById,
} from "@/lib/insights/role-taxonomy";
import type { ClassificationModel } from "@/lib/insights/settings";

export interface JobToClassify {
  id: string;
  title: string;
  skills: string[];
  seniority?: string;
  excerpt?: string;
}

export interface JobClassification {
  jobId: string;
  categoryId: string;
  confidence: number; // 0-100
  candidateName?: string; // raw classifier-preferred label when low confidence
}

function buildTaxonomyBlock(): string {
  // Stable prefix — designed to be cacheable. Keep ordering/content deterministic.
  const lines: string[] = [];
  for (const cat of ROLE_CATEGORIES) {
    if (cat.status !== "active") continue;
    lines.push(
      `- ${cat.id}: ${cat.displayName}. ${cat.description} Signals: ${cat.signalKeywords.slice(0, 8).join(", ")}`
    );
  }
  return lines.join("\n");
}

export function buildClassifierPrompt(jobs: JobToClassify[]): string {
  const trimmed = jobs.map((j) => ({
    jobId: j.id,
    title: j.title.slice(0, 200),
    skills: (j.skills || []).slice(0, 15),
    seniority: j.seniority,
    excerpt: j.excerpt ? j.excerpt.slice(0, 280) : undefined,
  }));

  return `You are a role classifier for engineering job postings. Classify each job into EXACTLY ONE category from the taxonomy below.

TAXONOMY (id: name. description. signals):
${buildTaxonomyBlock()}

CLASSIFICATION RULES:
- Pick the category whose signals best match the job's title + skills + excerpt.
- If no category is a confident fit, use "other" and include your preferred label in "candidateName".
- Confidence is 0-100. Use <60 when the fit is weak; <40 when you're guessing.
- Return one entry per jobId. Never invent job IDs.

JOBS (${trimmed.length}):
${JSON.stringify(trimmed)}

Return ONLY valid JSON in this shape:
{
  "results": [
    {"jobId": "...", "categoryId": "ai-engineering", "confidence": 85, "candidateName": null}
  ]
}`;
}

export function coerceClassifierOutput(
  raw: unknown,
  expectedJobIds: string[]
): JobClassification[] {
  const results: JobClassification[] = [];
  const seen = new Set<string>();
  const array = Array.isArray(raw) ? raw : [];

  for (const entry of array) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const jobId = typeof e.jobId === "string" ? e.jobId : null;
    if (!jobId || !expectedJobIds.includes(jobId) || seen.has(jobId)) continue;
    seen.add(jobId);

    let categoryId = typeof e.categoryId === "string" ? e.categoryId : "other";
    if (!getCategoryById(categoryId)) categoryId = "other";

    let confidence = typeof e.confidence === "number" ? e.confidence : 0;
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    const candidateName =
      typeof e.candidateName === "string" && e.candidateName.length > 0
        ? e.candidateName.slice(0, 80)
        : undefined;

    results.push({ jobId, categoryId, confidence, candidateName });
  }

  for (const jobId of expectedJobIds) {
    if (!seen.has(jobId)) {
      results.push({ jobId, categoryId: "other", confidence: 0 });
    }
  }

  return results;
}

/**
 * Skill: Job Classifier
 * Classifies a batch of jobs into the canonical taxonomy.
 * Returns one entry per input job; missing/invalid outputs default to "other".
 */
export async function classifyJobs(
  jobs: JobToClassify[],
  options?: { model?: ClassificationModel }
): Promise<{ taxonomyVersion: string; results: JobClassification[] }> {
  if (jobs.length === 0) {
    return { taxonomyVersion: TAXONOMY_VERSION, results: [] };
  }
  const prompt = buildClassifierPrompt(jobs);
  const raw = (await askJson(prompt, {
    skill: "job-classifier",
    model: options?.model || "sonnet",
    timeoutMs: 60_000,
  })) as { results?: unknown };

  const arrayInput = raw && typeof raw === "object" ? (raw as { results?: unknown }).results : raw;
  const results = coerceClassifierOutput(
    arrayInput,
    jobs.map((j) => j.id)
  );
  return { taxonomyVersion: TAXONOMY_VERSION, results };
}
