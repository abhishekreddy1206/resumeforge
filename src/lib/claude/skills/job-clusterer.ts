import { askJson } from "../client";

export interface JobCluster {
  name: string;
  description: string;
  jobIds: string[];
}

export interface ClusterResult {
  clusters: JobCluster[];
  summary: string;
}

/**
 * Skill: Job Clusterer
 *
 * Groups jobs into 2-5 semantic role profiles based on title,
 * skills, and requirements similarity. Groups by function/role type,
 * not by company or industry.
 */
export async function clusterJobs(
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    skills: string[];
    seniority?: string;
  }>,
  options?: { model?: string }
): Promise<ClusterResult> {
  const trimmed = jobs.slice(0, 30).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    skills: j.skills.slice(0, 12),
    seniority: j.seniority,
  }));

  return askJson(
    `You are a career strategist. Group these job postings into 2-5 role profiles based on the type of work, required skills, and function — NOT by company or industry.

JOBS (${trimmed.length}):
${JSON.stringify(trimmed)}

RULES:
- Each job must belong to exactly one cluster
- Cluster names should be short, descriptive role-type labels (e.g., "Backend Infrastructure", "Platform Engineering", "Full-Stack Product")
- Each cluster gets a one-sentence description of what unifies the jobs in it
- If all jobs are very similar, 2 clusters is fine. Only use more if there are genuinely distinct role types.
- Return every job ID in exactly one cluster

Return ONLY valid JSON:
{
  "clusters": [
    {"name": "Backend Infrastructure", "description": "Server-side systems roles focused on distributed services, APIs, and cloud infrastructure.", "jobIds": ["id1", "id2"]}
  ],
  "summary": "Your targets split into 2 profiles. Backend Infrastructure dominates (60%) with K8s/AWS as the common thread. Platform Engineering has fewer roles but higher average fit."
}`,
    { skill: "job-clusterer", model: options?.model || "haiku" }
  );
}
