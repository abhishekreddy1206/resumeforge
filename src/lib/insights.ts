import { prisma } from "@/lib/db";
import { clusterJobs, type GuideRecommendation } from "@/lib/claude";
import type { ClusterResult } from "@/lib/claude/skills/job-clusterer";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { safeJsonParse } from "@/lib/utils/json";

export const INSIGHTS_SCORE_THRESHOLD = 60;

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function normalizeTopic(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeTopic(value: string): string[] {
  return normalizeTopic(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export interface InsightsGuideRef {
  id: string;
  slug: string;
  topic: string;
}

export interface InsightsMeta {
  totalJobs: number;
  realisticJobs: number;
  threshold: number;
  avgScore: number;
  clusterCount: number;
  gapCount: number;
  topFinding: string | null;
  cachedAt: string | null;
}

export interface InsightsCluster {
  name: string;
  description: string;
  jobIds: string[];
  jobs: Array<{ id: string; title: string; company: string; score: number }>;
  topSkills: string[];
  avgScore: number;
}

export interface InsightsDemandPattern {
  skill: string;
  frequency: number;
  totalJobs: number;
  status: "gap" | "bridgeable" | "strong";
  clusters: string[];
  synonyms?: string[];
}

export interface InsightsGap {
  skill: string;
  frequency: number;
  clusters: string[];
  bridgeableBy?: { yourSkill: string; coverageCount: number };
  matchedGuide: InsightsGuideRef | null;
  coveredByGuide: boolean;
}

export interface InsightsBridge {
  jobRequirement: string;
  yourSkill: string;
  frequency: number;
  note: string;
}

export interface InsightsStrength {
  skill: string;
  frequency: number;
  clusters: string[];
}

export interface InsightsLearnTopic {
  rank: number;
  topic: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  gapSkills: Array<{ skill: string; frequency: number }>;
  clusters: string[];
  matchedGuide: InsightsGuideRef | null;
  coveredByGuide: boolean;
}

export interface InsightsResponse {
  meta: InsightsMeta;
  clusters: InsightsCluster[];
  clusterSummary: string;
  demandPatterns: InsightsDemandPattern[];
  gapAnalysis: {
    gaps: InsightsGap[];
    bridges: InsightsBridge[];
    strengths: InsightsStrength[];
  };
  learnTopics: InsightsLearnTopic[];
}

interface MatchBreakdown {
  score?: number;
  overallScore?: number;
  breakdown?: {
    gaps?: string[];
    bridgeableSkills?: Array<{ jobRequirement: string; yourSkill: string }>;
    directMatches?: string[];
  };
}

interface RealisticJob {
  id: string;
  title: string;
  company: string;
  score: number;
  matchedAt: Date | null;
  skills: string[];
  seniority: string | null;
  gaps: string[];
  bridges: Array<{ jobRequirement: string; yourSkill: string }>;
  directMatches: string[];
  terminologyMap: Array<{ jdTerm: string; resumeSynonyms: string[] }>;
}

export function computeInsightsFingerprint(
  jobs: Array<{ id: string; matchedAt: Date | null }>,
  profileSkillNames: string[],
  guides: Array<{ id: string; slug: string; topic: string }>
): string {
  const sortedJobs = [...jobs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((job) => [job.id, job.matchedAt?.toISOString() ?? null]);
  const sortedSkills = [...new Set(profileSkillNames.map((skill) => normalizeTopic(skill)))]
    .sort();
  const sortedGuides = [...guides]
    .map((guide) => ({
      id: guide.id,
      slug: guide.slug,
      topic: normalizeTopic(guide.topic),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return hashString(JSON.stringify({ sortedJobs, sortedSkills, sortedGuides }));
}

export function matchGuideToTopic(
  topic: string,
  guides: Array<{ id: string; slug: string; topic: string }>
): InsightsGuideRef | null {
  const normalizedTopic = normalizeTopic(topic);
  if (!normalizedTopic) return null;

  const exact = guides.find((guide) => normalizeTopic(guide.topic) === normalizedTopic);
  if (exact) {
    return { id: exact.id, slug: exact.slug, topic: exact.topic };
  }

  const targetTokens = tokenizeTopic(topic);
  if (targetTokens.length === 0) return null;

  const candidates = guides.filter((guide) => {
    const guideTokens = new Set(tokenizeTopic(guide.topic));
    if (guideTokens.size === 0) return false;

    const targetSubset = targetTokens.every((token) => guideTokens.has(token));
    const guideSubset = Array.from(guideTokens).every((token) => targetTokens.includes(token));
    return targetSubset || guideSubset;
  });

  if (candidates.length !== 1) return null;

  const guide = candidates[0];
  return { id: guide.id, slug: guide.slug, topic: guide.topic };
}

function buildFallbackLearnTopics(
  gaps: Array<{ skill: string; frequency: number; clusters: string[] }>,
  realisticJobCount: number,
  guides: Array<{ id: string; slug: string; topic: string }>
): InsightsLearnTopic[] {
  return gaps.slice(0, 8).map((gap, index) => {
    const matchedGuide = matchGuideToTopic(gap.skill, guides);
    return {
      rank: index + 1,
      topic: gap.skill.charAt(0).toUpperCase() + gap.skill.slice(1),
      description: `Addresses a gap found in ${gap.frequency} of your ${realisticJobCount} realistic targets${gap.clusters.length > 0 ? ` across ${gap.clusters.join(", ")}` : ""}.`,
      difficulty: (gap.frequency >= 3 ? "intermediate" : "beginner") as
        | "beginner"
        | "intermediate"
        | "advanced",
      gapSkills: [{ skill: gap.skill, frequency: gap.frequency }],
      clusters: gap.clusters,
      matchedGuide,
      coveredByGuide: Boolean(matchedGuide),
    };
  });
}

function mapRecommendationsToLearnTopics(
  recommendations: GuideRecommendation[],
  gapClusterMap: Map<string, string[]>,
  gapFrequencyMap: Map<string, number>,
  guides: Array<{ id: string; slug: string; topic: string }>
): InsightsLearnTopic[] {
  return recommendations.map((recommendation, index) => {
    const clusters = Array.from(
      new Set(
        recommendation.gapSkills.flatMap((skill) => gapClusterMap.get(skill.toLowerCase()) || [])
      )
    );

    const gapSkills = recommendation.gapSkills.map((skill) => ({
      skill,
      frequency: gapFrequencyMap.get(skill.toLowerCase()) || recommendation.frequency,
    }));

    const matchedGuide = matchGuideToTopic(recommendation.topic, guides);

    return {
      rank: index + 1,
      topic: recommendation.topic,
      description: recommendation.description,
      difficulty: recommendation.difficulty,
      gapSkills,
      clusters,
      matchedGuide,
      coveredByGuide: Boolean(matchedGuide),
    };
  });
}

export function summarizeInsightsForAnalytics(data: InsightsResponse | null) {
  if (!data) {
    return {
      realisticJobs: 0,
      clusterCount: 0,
      gapCount: 0,
      avgScore: 0,
      topFinding: null,
      coveredStudyTopics: 0,
      uncoveredStudyTopics: 0,
    };
  }

  const coveredStudyTopics = data.learnTopics.filter((topic) => topic.coveredByGuide).length;
  const uncoveredStudyTopics = data.learnTopics.length - coveredStudyTopics;

  return {
    realisticJobs: data.meta.realisticJobs,
    clusterCount: data.meta.clusterCount,
    gapCount: data.meta.gapCount,
    avgScore: data.meta.avgScore,
    topFinding: data.meta.topFinding,
    coveredStudyTopics,
    uncoveredStudyTopics,
  };
}

export async function getInsightsData(
  options: { cacheOnly?: boolean } = {}
): Promise<InsightsResponse | null> {
  const { cacheOnly = false } = options;

  if (cacheOnly) {
    const profile = await prisma.profile.findFirst({
      select: { cachedInsights: true },
    });
    if (!profile?.cachedInsights) return null;
    try {
      return JSON.parse(profile.cachedInsights) as InsightsResponse;
    } catch {
      return null;
    }
  }

  const [profile, allJobs, profileSkills, guides] = await Promise.all([
    prisma.profile.findFirst({
      select: {
        id: true,
        cachedInsights: true,
        insightsCacheFingerprint: true,
      },
    }),
    prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: {
        id: true,
        title: true,
        company: true,
        skills: true,
        seniority: true,
        matchResult: true,
        matchedAt: true,
        terminologyMap: true,
      },
    }),
    prisma.skill.findMany({ select: { name: true } }),
    prisma.guide.findMany({ select: { id: true, slug: true, topic: true } }),
  ]);

  if (!profile) return null;

  const realisticJobs: RealisticJob[] = [];
  for (const job of allJobs) {
    const mr = safeJsonParse<MatchBreakdown | null>(job.matchResult, null);
    if (!mr) continue;
    const score = mr.score ?? mr.overallScore ?? 0;
    if (score < INSIGHTS_SCORE_THRESHOLD) continue;
    realisticJobs.push({
      id: job.id,
      title: job.title,
      company: job.company,
      score,
      matchedAt: job.matchedAt,
      skills: safeJsonParse<string[]>(job.skills, []),
      seniority: job.seniority,
      gaps: mr.breakdown?.gaps || [],
      bridges: (mr.breakdown?.bridgeableSkills || []).map((bridge) => ({
        jobRequirement: bridge.jobRequirement,
        yourSkill: bridge.yourSkill,
      })),
      directMatches: mr.breakdown?.directMatches || [],
      terminologyMap: safeJsonParse<Array<{ jdTerm: string; resumeSynonyms: string[] }>>(
        job.terminologyMap,
        []
      ),
    });
  }

  const totalJobs = allJobs.length;

  if (realisticJobs.length < 2) {
    return {
      meta: {
        totalJobs,
        realisticJobs: realisticJobs.length,
        threshold: INSIGHTS_SCORE_THRESHOLD,
        avgScore: 0,
        clusterCount: 0,
        gapCount: 0,
        topFinding: null,
        cachedAt: null,
      },
      clusters: [],
      clusterSummary: "",
      demandPatterns: [],
      gapAnalysis: { gaps: [], bridges: [], strengths: [] },
      learnTopics: [],
    };
  }

  const fingerprint = computeInsightsFingerprint(
    realisticJobs.map((job) => ({ id: job.id, matchedAt: job.matchedAt })),
    profileSkills.map((skill) => skill.name),
    guides
  );

  if (profile.insightsCacheFingerprint === fingerprint && profile.cachedInsights) {
    return JSON.parse(profile.cachedInsights) as InsightsResponse;
  }

  const profileSkillNames = new Set(profileSkills.map((skill) => skill.name.toLowerCase()));

  const synonymToCanonical = new Map<string, string>();
  for (const job of realisticJobs) {
    for (const entry of job.terminologyMap) {
      for (const synonym of entry.resumeSynonyms) {
        synonymToCanonical.set(synonym.toLowerCase(), entry.jdTerm.toLowerCase());
      }
    }
  }

  const skillData = new Map<
    string,
    { frequency: number; jobIds: Set<string>; synonyms: Set<string> }
  >();

  for (const job of realisticJobs) {
    const seen = new Set<string>();
    for (const skill of job.skills) {
      const key = skill.toLowerCase();
      const canonical = synonymToCanonical.get(key);
      const normalizedKey = canonical || key;
      if (seen.has(normalizedKey)) continue;
      seen.add(normalizedKey);
      const entry = skillData.get(normalizedKey) || {
        frequency: 0,
        jobIds: new Set<string>(),
        synonyms: new Set<string>(),
      };
      entry.frequency++;
      entry.jobIds.add(job.id);
      if (canonical && canonical !== key) entry.synonyms.add(skill);
      skillData.set(normalizedKey, entry);
    }
  }

  const demandPatterns: InsightsDemandPattern[] = Array.from(skillData.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([skill, data]) => {
      let status: "gap" | "bridgeable" | "strong" = "gap";
      if (profileSkillNames.has(skill)) {
        status = "strong";
      } else {
        const canonical = synonymToCanonical.get(skill);
        if (canonical && profileSkillNames.has(canonical)) {
          status = "strong";
        } else {
          for (const profileSkill of profileSkillNames) {
            if (synonymToCanonical.get(profileSkill) === skill) {
              status = "bridgeable";
              break;
            }
          }
        }
      }

      return {
        skill,
        frequency: data.frequency,
        totalJobs: realisticJobs.length,
        status,
        clusters: [],
        synonyms: data.synonyms.size > 0 ? Array.from(data.synonyms) : undefined,
      };
    });

  const gapFreq = new Map<
    string,
    { frequency: number; jobIds: Set<string>; bridgeableBy?: { yourSkill: string; count: number } }
  >();
  const bridgeFreq = new Map<string, { yourSkill: string; frequency: number }>();
  const strengthFreq = new Map<string, { frequency: number; jobIds: Set<string> }>();

  for (const job of realisticJobs) {
    for (const gap of job.gaps) {
      const key = gap.toLowerCase();
      const entry = gapFreq.get(key) || { frequency: 0, jobIds: new Set<string>() };
      entry.frequency++;
      entry.jobIds.add(job.id);
      gapFreq.set(key, entry);
    }

    for (const bridge of job.bridges) {
      const key = bridge.jobRequirement.toLowerCase();
      const gapEntry = gapFreq.get(key) || { frequency: 0, jobIds: new Set<string>() };
      const bridgeEntry = bridgeFreq.get(key) || {
        yourSkill: bridge.yourSkill,
        frequency: 0,
      };
      bridgeEntry.frequency++;
      bridgeFreq.set(key, bridgeEntry);
      if (gapEntry.frequency > 0) {
        gapEntry.bridgeableBy = {
          yourSkill: bridge.yourSkill,
          count: (gapEntry.bridgeableBy?.count || 0) + 1,
        };
        gapFreq.set(key, gapEntry);
      }
    }

    for (const match of job.directMatches) {
      const key = match.toLowerCase();
      const entry = strengthFreq.get(key) || { frequency: 0, jobIds: new Set<string>() };
      entry.frequency++;
      entry.jobIds.add(job.id);
      strengthFreq.set(key, entry);
    }
  }

  let clusterResult: ClusterResult;
  if (realisticJobs.length < 3) {
    clusterResult = {
      clusters: [
        {
          name: "All Targets",
          description: "All your realistic job targets.",
          jobIds: realisticJobs.map((job) => job.id),
        },
      ],
      summary: `You have ${realisticJobs.length} realistic targets. Add more scored jobs to enable AI clustering.`,
    };
  } else {
    clusterResult = await clusterJobs(
      realisticJobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        skills: job.skills,
        seniority: job.seniority || undefined,
      }))
    );
  }

  const jobToCluster = new Map<string, string>();
  const clusters: InsightsCluster[] = clusterResult.clusters.map((cluster) => {
    const clusterJobsData = realisticJobs.filter((job) => cluster.jobIds.includes(job.id));
    for (const job of clusterJobsData) jobToCluster.set(job.id, cluster.name);

    const clusterSkillFreq = new Map<string, number>();
    for (const job of clusterJobsData) {
      for (const skill of job.skills) {
        const key = skill.toLowerCase();
        clusterSkillFreq.set(key, (clusterSkillFreq.get(key) || 0) + 1);
      }
    }

    return {
      name: cluster.name,
      description: cluster.description,
      jobIds: cluster.jobIds,
      jobs: clusterJobsData.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        score: job.score,
      })),
      topSkills: Array.from(clusterSkillFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([skill]) => skill),
      avgScore:
        clusterJobsData.length > 0
          ? Math.round(
              clusterJobsData.reduce((sum, job) => sum + job.score, 0) / clusterJobsData.length
            )
          : 0,
    };
  });

  for (const demandPattern of demandPatterns) {
    const data = skillData.get(demandPattern.skill);
    if (!data) continue;
    const clusterNames = new Set<string>();
    for (const jobId of data.jobIds) {
      const clusterName = jobToCluster.get(jobId);
      if (clusterName) clusterNames.add(clusterName);
    }
    demandPattern.clusters = Array.from(clusterNames);
  }

  const gaps = Array.from(gapFreq.entries())
    .filter(([key]) => !bridgeFreq.has(key))
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([skill, data]) => {
      const clusterNames = new Set<string>();
      for (const jobId of data.jobIds) {
        const clusterName = jobToCluster.get(jobId);
        if (clusterName) clusterNames.add(clusterName);
      }
      const matchedGuide = matchGuideToTopic(skill, guides);
      return {
        skill,
        frequency: data.frequency,
        clusters: Array.from(clusterNames),
        bridgeableBy: data.bridgeableBy
          ? {
              yourSkill: data.bridgeableBy.yourSkill,
              coverageCount: data.bridgeableBy.count,
            }
          : undefined,
        matchedGuide,
        coveredByGuide: Boolean(matchedGuide),
      };
    });

  const bridges = Array.from(bridgeFreq.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([jobRequirement, data]) => ({
      jobRequirement,
      yourSkill: data.yourSkill,
      frequency: data.frequency,
      note: "terminology gap, not knowledge gap",
    }));

  const strengths = Array.from(strengthFreq.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 15)
    .map(([skill, data]) => {
      const clusterNames = new Set<string>();
      for (const jobId of data.jobIds) {
        const clusterName = jobToCluster.get(jobId);
        if (clusterName) clusterNames.add(clusterName);
      }
      return {
        skill,
        frequency: data.frequency,
        clusters: Array.from(clusterNames),
      };
    });

  const gapClusterMap = new Map<string, string[]>(
    gaps.map((gap) => [gap.skill.toLowerCase(), gap.clusters])
  );
  const gapFrequencyMap = new Map<string, number>(
    gaps.map((gap) => [gap.skill.toLowerCase(), gap.frequency])
  );

  const recommendations = await refreshRecommendationsCache();
  const learnTopics =
    recommendations.length > 0
      ? mapRecommendationsToLearnTopics(recommendations, gapClusterMap, gapFrequencyMap, guides)
      : buildFallbackLearnTopics(gaps, realisticJobs.length, guides);

  const avgScore = Math.round(
    realisticJobs.reduce((sum, job) => sum + job.score, 0) / realisticJobs.length
  );

  const topGap = gaps[0];
  const topFinding = topGap
    ? `${topGap.skill.charAt(0).toUpperCase() + topGap.skill.slice(1)} appears in ${topGap.frequency}/${realisticJobs.length} of your realistic targets.${topGap.clusters.length > 1 ? ` Studying it would impact ${topGap.clusters.length} role clusters.` : ""}`
    : "You're well-matched across your realistic targets.";

  const response: InsightsResponse = {
    meta: {
      totalJobs,
      realisticJobs: realisticJobs.length,
      threshold: INSIGHTS_SCORE_THRESHOLD,
      avgScore,
      clusterCount: clusters.length,
      gapCount: gaps.length,
      topFinding,
      cachedAt: new Date().toISOString(),
    },
    clusters,
    clusterSummary: clusterResult.summary,
    demandPatterns,
    gapAnalysis: { gaps, bridges, strengths },
    learnTopics,
  };

  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      cachedInsights: JSON.stringify(response),
      cachedInsightsAt: new Date(),
      insightsCacheFingerprint: fingerprint,
    },
  });

  return response;
}
