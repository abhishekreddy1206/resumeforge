import {
  getCategoryById,
  type HotTopic,
} from "@/lib/insights/role-taxonomy";

export interface RankedTopic {
  clusterId: string;
  clusterName: string;
  topic: HotTopic;
  relevance: number;
  matchedGaps: string[];
}

export interface RankOptions {
  topicsPerCluster: number;
  totalLimit: number;
  alwaysRelevantMinJobs?: number; // default 3
  coveredByGuideIds?: Set<string>; // exclude topics already matched to a guide (any status)
}

const WEIGHTS = {
  categoryJobCount: 1.0,
  gapOverlap: 5.0,
  alwaysRelevant: 2.0,
};

function normalizeGapSet(gaps: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const g of gaps) {
    out.add(g.toLowerCase().trim());
  }
  return out;
}

export function rankTopicsForClusters(
  clusters: Array<{ id: string; jobs: Array<unknown> }>,
  userGapSet: Set<string>,
  options: RankOptions
): RankedTopic[] {
  const minAlways = options.alwaysRelevantMinJobs ?? 3;
  const normalizedGaps = normalizeGapSet(userGapSet);
  const allRanked: RankedTopic[] = [];

  for (const cluster of clusters) {
    const cat = getCategoryById(cluster.id);
    if (!cat) continue;
    const clusterJobCount = cluster.jobs.length;

    for (const topic of cat.hotTopics) {
      const matchedGaps = topic.skillKeywords.filter((k) =>
        normalizedGaps.has(k.toLowerCase())
      );
      const hasGap = matchedGaps.length > 0;
      const alwaysHit = !!topic.alwaysRelevant && clusterJobCount >= minAlways;
      if (!hasGap && !alwaysHit) continue;

      if (options.coveredByGuideIds?.has(topic.id)) continue;
      const relevance =
        clusterJobCount * WEIGHTS.categoryJobCount +
        matchedGaps.length * WEIGHTS.gapOverlap +
        (alwaysHit ? WEIGHTS.alwaysRelevant : 0);

      allRanked.push({
        clusterId: cluster.id,
        clusterName: cat.displayName,
        topic,
        relevance,
        matchedGaps,
      });
    }
  }

  allRanked.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return a.topic.id.localeCompare(b.topic.id);
  });

  const perCluster = new Map<string, number>();
  const capped: RankedTopic[] = [];
  for (const t of allRanked) {
    const c = perCluster.get(t.clusterId) ?? 0;
    if (c >= options.topicsPerCluster) continue;
    perCluster.set(t.clusterId, c + 1);
    capped.push(t);
    if (capped.length >= options.totalLimit) break;
  }
  return capped;
}

// The return shape mirrors InsightsLearnTopic in src/lib/insights.ts
// (kept local as a structural type so this module does not depend on insights.ts).
export interface RankedInsightsLearnTopic {
  rank: number;
  topic: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  gapSkills: Array<{ skill: string; frequency: number }>;
  clusters: string[];
  matchedGuide: { id: string; slug: string; topic: string } | null;
  coveredByGuide: boolean;
}

export function toInsightsLearnTopic(
  r: RankedTopic,
  matchedGuide: { id: string; slug: string; topic: string } | null,
  rank: number,
  gapFrequencyMap?: Map<string, number>
): RankedInsightsLearnTopic {
  return {
    rank,
    topic: r.topic.title,
    description: r.topic.description,
    difficulty: r.topic.difficulty,
    gapSkills: r.matchedGaps.map((skill) => ({
      skill,
      frequency: gapFrequencyMap?.get(skill.toLowerCase()) ?? 1,
    })),
    clusters: [r.clusterName],
    matchedGuide,
    coveredByGuide: !!matchedGuide,
  };
}
