import { prisma } from "@/lib/db";

/**
 * Scans 'other'-bucket jobs for recurring candidate labels and creates
 * TaxonomyRecommendation rows for dev review. Skips candidates that already
 * have a pending recommendation.
 */
export async function computeTaxonomyGaps(
  options: { minJobs?: number } = {}
): Promise<{ created: number }> {
  const minJobs = options.minJobs ?? 5;

  const otherJobs = await prisma.job.findMany({
    where: { roleCategory: "other", roleCategoryCandidate: { not: null } },
    select: { id: true, roleCategoryCandidate: true, skills: true },
  });

  const byCandidate = new Map<string, { jobIds: string[]; skills: Map<string, number> }>();
  for (const j of otherJobs) {
    const key = (j.roleCategoryCandidate ?? "").trim().toLowerCase();
    if (!key) continue;
    const bucket = byCandidate.get(key) ?? { jobIds: [], skills: new Map<string, number>() };
    bucket.jobIds.push(j.id);
    try {
      const skills = JSON.parse(j.skills ?? "[]") as unknown[];
      for (const s of skills) {
        if (typeof s === "string") {
          const k = s.toLowerCase();
          bucket.skills.set(k, (bucket.skills.get(k) ?? 0) + 1);
        }
      }
    } catch {
      // ignore malformed JSON
    }
    byCandidate.set(key, bucket);
  }

  let created = 0;
  for (const [name, { jobIds, skills }] of byCandidate) {
    if (jobIds.length < minJobs) continue;
    const existing = await prisma.taxonomyRecommendation.findFirst({
      where: { suggestedName: name, status: "pending" },
    });
    if (existing) continue;

    const topSkills = Array.from(skills.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([s]) => s);

    await prisma.taxonomyRecommendation.create({
      data: {
        suggestedName: name,
        supportingJobCount: jobIds.length,
        exampleJobIds: JSON.stringify(jobIds.slice(0, 20)),
        signalKeywords: JSON.stringify(topSkills),
      },
    });
    created++;
  }
  return { created };
}

export async function listPendingRecommendations() {
  return prisma.taxonomyRecommendation.findMany({
    where: { status: "pending" },
    orderBy: { supportingJobCount: "desc" },
  });
}
