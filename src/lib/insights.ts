import { prisma } from "@/lib/db";
import { subclusterOtherJobs } from "@/lib/claude";
import { safeJsonParse } from "@/lib/utils/json";
import { rankTopicsForClusters, toInsightsLearnTopic } from "@/lib/insights/topic-ranker";
import { createLogger } from "@/lib/logger";
import {
  ROLE_CATEGORIES,
  getCategoryById,
  TAXONOMY_VERSION,
} from "@/lib/insights/role-taxonomy";
import { loadInsightsSettingsFromProfile } from "@/lib/insights/settings";
import type { InsightsSettings } from "@/lib/insights/settings";
import { hashJobSubstance } from "@/lib/cache-fingerprints";

const log = createLogger("insights");

export const INSIGHTS_SCORE_THRESHOLD = 60;


function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function buildDescriptionExcerpt(description: string): string {
  if (!description) return "";
  // Strip markdown/HTML-ish noise so the excerpt reads cleanly in the prompt.
  const plain = description
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 280) return plain;
  return plain.slice(0, 280).replace(/\s+\S*$/, "").trimEnd() + "…";
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

function buildDeterministicClusterSummary(
  clusters: Array<{ name: string; jobs: Array<{ score: number }> }>,
  totalRealistic: number
): string {
  if (clusters.length === 0) return "No realistic targets yet.";
  const top = clusters[0];
  const topPct = Math.round((top.jobs.length / totalRealistic) * 100);
  if (clusters.length === 1) {
    return `All ${totalRealistic} realistic targets fall in ${top.name}.`;
  }
  return `Your targets split into ${clusters.length} role profiles. ${top.name} dominates (${topPct}%).`;
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
  pendingClassificationCount: number;
  taxonomyVersion: string;
}

export interface InsightsCluster {
  id: string;
  name: string;
  description: string;
  jobIds: string[];
  jobs: Array<{ id: string; title: string; company: string; score: number }>;
  topSkills: string[];
  topGaps: string[];
  avgScore: number;
  subClusters?: Array<{ name: string; jobIds: string[] }>;
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
  description: string;
  score: number;
  applied: boolean;
  matchedAt: Date | null;
  skills: string[];
  seniority: string | null;
  gaps: string[];
  bridges: Array<{ jobRequirement: string; yourSkill: string }>;
  directMatches: string[];
  terminologyMap: Array<{ jdTerm: string; resumeSynonyms: string[] }>;
  roleCategory: string | null;
  roleCategoryVersion: string | null;
  matchResult?: string | null;        // raw JSON string for fingerprinting
  terminologyMapRaw?: string | null;
  descriptionRaw?: string | null;
}

export function computeInsightsFingerprint(
  jobs: Array<{
    id: string;
    matchedAt: Date | null;
    matchResult?: string | null;
    terminologyMap?: string | null;
    description?: string | null;
    applied?: boolean;
    score?: number;
    roleCategory?: string | null;
    roleCategoryVersion?: string | null;
  }>,
  guides: Array<{ id: string; slug: string; topic: string }>,
  extra?: {
    profileSkillsHash?: string;
    jobCount?: number;
    taxonomyVersion?: string;
    settings?: InsightsSettings;
  }
): string {
  const sortedJobs = [...jobs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((job) => [
      job.id,
      hashJobSubstance({
        id: job.id,
        matchedAt: job.matchedAt,
        matchResult: job.matchResult ?? null,
        terminologyMap: job.terminologyMap ?? null,
        description: job.description ?? null,
      }),
      job.applied ?? false,
      typeof job.score === "number" ? Math.round(job.score) : null,
      job.roleCategory ?? null,
      job.roleCategoryVersion ?? null,
    ]);
  const sortedGuides = [...guides]
    .map((guide) => ({
      id: guide.id,
      slug: guide.slug,
      topic: normalizeTopic(guide.topic),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return hashString(
    JSON.stringify({
      sortedJobs,
      sortedGuides,
      profileSkillsHash: extra?.profileSkillsHash ?? null,
      jobCount: extra?.jobCount ?? null,
      taxonomyVersion: extra?.taxonomyVersion ?? null,
      settings: extra?.settings ?? null,
    })
  );
}

export function hashProfileSkills(
  skills: Array<{ name: string }>
): string {
  const normalized = [...skills]
    .map((s) => s.name.toLowerCase().trim())
    .filter((name) => name.length > 0)
    .sort();
  return hashString(JSON.stringify(normalized));
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
  options: { cacheOnly?: boolean; force?: boolean } = {}
): Promise<InsightsResponse | null> {
  const { cacheOnly = false, force = false } = options;

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
        insightsSettings: true,
      },
    }),
    prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: {
        id: true,
        title: true,
        company: true,
        description: true,
        skills: true,
        seniority: true,
        applied: true,
        matchResult: true,
        matchedAt: true,
        terminologyMap: true,
        roleCategory: true,
        roleCategoryVersion: true,
      },
    }),
    prisma.skill.findMany({ select: { name: true } }),
    prisma.guide.findMany({ select: { id: true, slug: true, topic: true } }),
  ]);

  if (!profile) return null;

  const settings = loadInsightsSettingsFromProfile({ insightsSettings: profile.insightsSettings ?? null });

  const realisticJobs: RealisticJob[] = [];
  for (const job of allJobs) {
    const mr = safeJsonParse<MatchBreakdown | null>(job.matchResult, null);
    if (!mr) continue;
    const score = mr.score ?? mr.overallScore ?? 0;
    if (score < settings.realisticScoreThreshold) continue;
    realisticJobs.push({
      id: job.id,
      title: job.title,
      company: job.company,
      description: job.description,
      score,
      applied: job.applied,
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
      roleCategory: job.roleCategory ?? null,
      roleCategoryVersion: job.roleCategoryVersion ?? null,
      matchResult: job.matchResult,
      terminologyMapRaw: job.terminologyMap,
      descriptionRaw: job.description,
    });
  }

  const totalJobs = allJobs.length;

  if (realisticJobs.length < 2) {
    return {
      meta: {
        totalJobs,
        realisticJobs: realisticJobs.length,
        threshold: settings.realisticScoreThreshold,
        avgScore: 0,
        clusterCount: 0,
        gapCount: 0,
        topFinding: null,
        cachedAt: null,
        pendingClassificationCount: realisticJobs.filter((j) => !j.roleCategory).length,
        taxonomyVersion: TAXONOMY_VERSION,
      },
      clusters: [],
      clusterSummary: "",
      demandPatterns: [],
      gapAnalysis: { gaps: [], bridges: [], strengths: [] },
      learnTopics: [],
    };
  }

  const profileSkillsHash = hashProfileSkills(profileSkills);

  const fingerprint = computeInsightsFingerprint(
    realisticJobs.map((job) => ({
      id: job.id,
      matchedAt: job.matchedAt,
      matchResult: job.matchResult ?? null,
      terminologyMap: job.terminologyMapRaw ?? null,
      description: job.descriptionRaw ?? null,
      applied: job.applied,
      score: job.score,
      roleCategory: job.roleCategory,
      roleCategoryVersion: job.roleCategoryVersion,
    })),
    guides,
    {
      profileSkillsHash,
      jobCount: allJobs.length,
      taxonomyVersion: TAXONOMY_VERSION,
      settings,
    }
  );

  if (!force && profile.insightsCacheFingerprint === fingerprint && profile.cachedInsights) {
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

  const byCategory = new Map<string, typeof realisticJobs>();
  for (const job of realisticJobs) {
    const catId = job.roleCategory && getCategoryById(job.roleCategory)
      ? job.roleCategory
      : "other";
    const list = byCategory.get(catId) ?? [];
    list.push(job);
    byCategory.set(catId, list);
  }

  type ReconciledCluster = {
    id: string;
    name: string;
    description: string;
    jobs: typeof realisticJobs;
  };

  const reconciledClusters: ReconciledCluster[] = [];
  for (const cat of ROLE_CATEGORIES) {
    const jobsInCat = byCategory.get(cat.id);
    if (!jobsInCat || jobsInCat.length === 0) continue;
    reconciledClusters.push({
      id: cat.id,
      name: cat.displayName,
      description: cat.description,
      jobs: jobsInCat,
    });
  }

  reconciledClusters.sort((a, b) => {
    switch (settings.clusterSortOrder) {
      case "alphabetical":
        return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      case "avgScore": {
        const avgA = a.jobs.reduce((s, j) => s + (j.score || 0), 0) / a.jobs.length;
        const avgB = b.jobs.reduce((s, j) => s + (j.score || 0), 0) / b.jobs.length;
        return (avgB - avgA) || a.id.localeCompare(b.id);
      }
      case "jobCount":
      default:
        return (b.jobs.length - a.jobs.length) || a.id.localeCompare(b.id);
    }
  });

  const pendingClassificationCount = realisticJobs.filter((j) => !j.roleCategory).length;
  const clusterSummary = buildDeterministicClusterSummary(reconciledClusters, realisticJobs.length);

  const otherCluster = reconciledClusters.find((c) => c.id === "other");
  let otherSubClusters: Array<{ name: string; jobIds: string[] }> = [];
  if (otherCluster && otherCluster.jobs.length >= settings.otherSubClusterMinJobs) {
    try {
      otherSubClusters = await subclusterOtherJobs(
        otherCluster.jobs.map((j) => ({
          id: j.id,
          title: j.title,
          skills: j.skills,
          excerpt: buildDescriptionExcerpt(j.description || ""),
        }))
      );
    } catch (err) {
      log.warn("other_subcluster_failed", {
        error: err instanceof Error ? err.message : String(err),
        count: otherCluster.jobs.length,
      });
      otherSubClusters = [];
    }
  }

  const jobToCluster = new Map<string, string>();
  const clusters: InsightsCluster[] = reconciledClusters.map((cluster) => {
    for (const job of cluster.jobs) jobToCluster.set(job.id, cluster.name);

    const clusterSkillFreq = new Map<string, number>();
    for (const job of cluster.jobs) {
      for (const skill of job.skills) {
        const key = skill.toLowerCase();
        clusterSkillFreq.set(key, (clusterSkillFreq.get(key) || 0) + 1);
      }
    }

    return {
      id: cluster.id,
      name: cluster.name,
      description: cluster.description,
      jobIds: cluster.jobs.map((j) => j.id),
      jobs: cluster.jobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        score: job.score,
      })),
      topSkills: Array.from(clusterSkillFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([skill]) => skill),
      topGaps: [],
      avgScore: Math.round(
        cluster.jobs.reduce((sum, job) => sum + job.score, 0) / cluster.jobs.length
      ),
      ...(cluster.id === "other" && otherSubClusters.length > 0
        ? { subClusters: otherSubClusters }
        : {}),
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

  for (const cluster of clusters) {
    const clusterJobIdSet = new Set(cluster.jobIds);
    const perClusterGapFreq = new Map<string, number>();
    for (const [gapSkill, data] of gapFreq) {
      // Skip bridgeable gaps — same rule as the global `gaps` list.
      if (bridgeFreq.has(gapSkill)) continue;
      let count = 0;
      for (const id of data.jobIds) if (clusterJobIdSet.has(id)) count++;
      if (count > 0) perClusterGapFreq.set(gapSkill, count);
    }
    cluster.topGaps = Array.from(perClusterGapFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skill]) => skill);
  }

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

  const gapFrequencyMap = new Map<string, number>(
    gaps.map((gap) => [gap.skill.toLowerCase(), gap.frequency])
  );

  const userGapSet = new Set<string>(gaps.map((g) => g.skill.toLowerCase()));

  // Build the set of taxonomy topic ids already covered by an existing guide,
  // so the ranker can apply guidedPenalty and surface un-covered topics first.
  const coveredByGuideIds = new Set<string>();
  for (const cat of ROLE_CATEGORIES) {
    for (const topic of cat.hotTopics) {
      if (matchGuideToTopic(topic.title, guides)) {
        coveredByGuideIds.add(topic.id);
      }
    }
  }

  const ranked = rankTopicsForClusters(
    reconciledClusters.map((c) => ({ id: c.id, jobs: c.jobs })),
    userGapSet,
    { topicsPerCluster: 3, totalLimit: 12, coveredByGuideIds }
  );

  const learnTopics = ranked.map((r, i) =>
    toInsightsLearnTopic(
      r,
      matchGuideToTopic(r.topic.title, guides),
      i + 1,
      gapFrequencyMap
    )
  );

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
      threshold: settings.realisticScoreThreshold,
      avgScore,
      clusterCount: clusters.length,
      gapCount: gaps.length,
      topFinding,
      cachedAt: new Date().toISOString(),
      pendingClassificationCount,
      taxonomyVersion: TAXONOMY_VERSION,
    },
    clusters,
    clusterSummary,
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
