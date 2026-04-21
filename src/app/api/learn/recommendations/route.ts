import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withLogging } from "@/lib/api-handler";
import { rankTopicsForClusters } from "@/lib/insights/topic-ranker";
import { getCategoryById } from "@/lib/insights/role-taxonomy";
import { loadInsightsSettingsFromProfile } from "@/lib/insights/settings";
import { safeJsonParse } from "@/lib/utils/json";

interface GuideRecommendation {
  topic: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  gapSkills: string[];
  frequency: number;
}

export const GET = withLogging(async () => {
  const profile = await prisma.profile.findFirst({
    include: {
      skills: true,
    },
  });
  if (!profile) return NextResponse.json([]);

  const settings = loadInsightsSettingsFromProfile(profile);

  const jobs = await prisma.job.findMany({
    where: { matchResult: { not: null } },
    select: { id: true, roleCategory: true, matchResult: true, skills: true },
  });

  const realistic = jobs.filter((j) => {
    const mr = safeJsonParse<{ score?: number }>(j.matchResult ?? "{}", {});
    return (mr.score ?? 0) >= settings.realisticScoreThreshold;
  });

  if (realistic.length === 0) return NextResponse.json([]);

  const byCategory = new Map<string, Array<{ id: string }>>();
  for (const job of realistic) {
    const cat = job.roleCategory && getCategoryById(job.roleCategory) ? job.roleCategory : "other";
    const list = byCategory.get(cat) ?? [];
    list.push({ id: job.id });
    byCategory.set(cat, list);
  }
  const clusters = Array.from(byCategory, ([id, jobsInCat]) => ({ id, jobs: jobsInCat }));

  // Minimal gap inference: skills appearing in ≥2 realistic jobs but not in the
  // profile. Full gap analysis lives in /api/insights — this is sufficient for
  // ranking curated topics.
  const profileSkillSet = new Set(profile.skills.map((s) => s.name.toLowerCase()));
  const jobSkillCounts = new Map<string, number>();
  for (const job of realistic) {
    const skills = safeJsonParse<string[]>(job.skills ?? "[]", []);
    for (const s of skills) {
      const key = s.toLowerCase();
      jobSkillCounts.set(key, (jobSkillCounts.get(key) ?? 0) + 1);
    }
  }
  const gapSet = new Set<string>();
  for (const [skill, count] of jobSkillCounts) {
    if (count >= 2 && !profileSkillSet.has(skill)) gapSet.add(skill);
  }

  const ranked = rankTopicsForClusters(clusters, gapSet, {
    topicsPerCluster: 3,
    totalLimit: 15,
  });

  // Shape-preserving response: the Learn page consumes a flat array of
  // GuideRecommendation (legacy shape). `frequency` = cluster size (addressable
  // market for this topic); `gapSkills` flattens to string[] to match the type.
  const clusterSize = new Map(clusters.map((c) => [c.id, c.jobs.length]));
  const recommendations: GuideRecommendation[] = ranked.map((r) => ({
    topic: r.topic.title,
    description: r.topic.description,
    difficulty: r.topic.difficulty,
    gapSkills: r.matchedGaps,
    frequency: clusterSize.get(r.clusterId) ?? 0,
  }));

  return NextResponse.json(recommendations);
});
