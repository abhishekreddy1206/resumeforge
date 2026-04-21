import { askJson } from "../client";

export interface OtherJobInput {
  id: string;
  title: string;
  skills: string[];
  excerpt?: string;
}

export interface OtherSubCluster {
  name: string;
  jobIds: string[];
}

export async function subclusterOtherJobs(
  jobs: OtherJobInput[]
): Promise<OtherSubCluster[]> {
  if (jobs.length < 3) {
    return [{ name: "Specialized / Other", jobIds: jobs.map((j) => j.id) }];
  }
  const trimmed = jobs.slice(0, 40).map((j) => ({
    id: j.id,
    title: j.title.slice(0, 120),
    skills: (j.skills || []).slice(0, 10),
    excerpt: j.excerpt?.slice(0, 180),
  }));
  const prompt = `Group these specialty job postings into 2-4 small clusters by role type. These are roles that didn't fit a canonical engineering taxonomy, so cluster labels can be specific (e.g., "Quantum Computing", "Robotics", "Web3", "Quant Trading").

RULES:
- Use ONLY the job IDs provided. Every ID appears exactly once across clusters.
- Cluster names: short descriptive labels. Prefer proper-noun domains.

JOBS (${trimmed.length}):
${JSON.stringify(trimmed)}

Return ONLY valid JSON:
{"clusters": [{"name": "...", "jobIds": ["..."]}]}`;

  const raw = (await askJson(prompt, {
    skill: "other-subclusterer",
    model: "sonnet",
    timeoutMs: 45_000,
  })) as { clusters?: unknown };

  if (!raw || typeof raw !== "object" || !Array.isArray(raw.clusters)) {
    return [{ name: "Specialized / Other", jobIds: jobs.map((j) => j.id) }];
  }
  const seen = new Set<string>();
  const validIds = new Set(jobs.map((j) => j.id));
  const out: OtherSubCluster[] = [];
  for (const c of raw.clusters) {
    if (!c || typeof c !== "object") continue;
    const cc = c as { name?: unknown; jobIds?: unknown };
    const name = typeof cc.name === "string" ? cc.name.slice(0, 60) : null;
    const ids = Array.isArray(cc.jobIds)
      ? cc.jobIds.filter(
          (x): x is string =>
            typeof x === "string" && validIds.has(x) && !seen.has(x)
        )
      : [];
    if (!name || ids.length === 0) continue;
    ids.forEach((id) => seen.add(id));
    out.push({ name, jobIds: ids });
  }
  const unclaimed = jobs.filter((j) => !seen.has(j.id)).map((j) => j.id);
  if (unclaimed.length > 0) {
    out.push({ name: "Other", jobIds: unclaimed });
  }
  return out.length > 0
    ? out
    : [{ name: "Specialized / Other", jobIds: jobs.map((j) => j.id) }];
}
