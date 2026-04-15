import type { InsightsResponse } from "@/lib/insights";

export function normalizeJobSource(source: string | null | undefined): string {
  return source && source.trim() ? source.trim() : "manual";
}

export function isPlaceholderJob(job: {
  title: string;
  company: string;
  description: string;
}): boolean {
  return (
    job.title === "Analyzing..." ||
    job.title === "Untitled Position" ||
    job.title.startsWith("Analysis Failed") ||
    job.company === "Unknown Company" ||
    job.description.startsWith("[Could not scrape")
  );
}

export function summarizeJobsBySource(
  jobs: Array<{ source: string | null | undefined }>
): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const source = normalizeJobSource(job.source);
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

export function summarizeStudyTopicCoverage(insights: InsightsResponse | null) {
  if (!insights) {
    return {
      coveredStudyTopics: 0,
      uncoveredStudyTopics: 0,
    };
  }

  const coveredStudyTopics = insights.learnTopics.filter((topic) => topic.coveredByGuide).length;
  return {
    coveredStudyTopics,
    uncoveredStudyTopics: insights.learnTopics.length - coveredStudyTopics,
  };
}

function bucketDistribution(values: number[]) {
  const buckets = new Map<string, number>();
  for (const value of values) {
    const floor = Math.floor(value / 10) * 10;
    const key = `${floor}-${floor + 9}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([range, count]) => ({ range, count }))
    .sort((a, b) => a.range.localeCompare(b.range));
}

export function getMatchScore(job: { matchResult: string | null | undefined }): number | null {
  if (!job.matchResult) return null;
  try {
    const parsed = JSON.parse(job.matchResult) as { overallScore?: number };
    return typeof parsed.overallScore === "number" ? parsed.overallScore : null;
  } catch {
    return null;
  }
}

export function summarizeMatchTrends(jobs: Array<{ matchResult: string | null | undefined }>) {
  const scores = jobs
    .map((job) => getMatchScore(job))
    .filter((score): score is number => typeof score === "number");

  const averageScore =
    scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;

  return {
    averageScore,
    jobCount: scores.length,
    strongFitCount: scores.filter((score) => score >= 75).length,
    distribution: bucketDistribution(scores),
  };
}

export function summarizeResumeQualityTrends(
  versions: Array<{ jobId: string; score: number; delta: number | null; scoreVersion?: number | null }>
) {
  const v2Versions = versions.filter((version) => version.scoreVersion === 2);
  const latestByJob = new Map<string, { score: number; delta: number | null }>();

  for (const version of v2Versions) {
    latestByJob.set(version.jobId, { score: version.score, delta: version.delta });
  }

  const latestScores = Array.from(latestByJob.values()).map((entry) => entry.score);
  const deltas = Array.from(latestByJob.values())
    .map((entry) => entry.delta)
    .filter((delta): delta is number => typeof delta === "number");

  const averageQuality =
    latestScores.length > 0
      ? Math.round(latestScores.reduce((sum, score) => sum + score, 0) / latestScores.length)
      : 0;

  const averageDelta =
    deltas.length > 0 ? Math.round(deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length) : 0;

  return {
    averageQuality,
    averageDelta,
    jobCount: latestScores.length,
    distribution: bucketDistribution(latestScores),
  };
}

export function summarizeQualityHealth(
  evaluations: Array<{
    evaluation: string | null;
    evaluationStatus: string | null;
    evaluationVersion: number | null;
    roleArchetype?: string | null;
    jobId?: string | null;
  }>,
  totalJobs: number
) {
  const parsed = evaluations
    .filter((entry) => entry.evaluationStatus === "done" && entry.evaluationVersion === 2 && entry.evaluation)
    .map((entry) => {
      try {
        const evaluation = JSON.parse(entry.evaluation as string) as {
          overallScore?: number;
          hardBlockers?: Array<{ code?: string }>;
          warnings?: Array<{ code?: string }>;
        };
        return {
          evaluation,
          roleArchetype: entry.roleArchetype || "unknown",
          jobId: entry.jobId || null,
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { evaluation: { overallScore?: number; hardBlockers?: Array<{ code?: string }>; warnings?: Array<{ code?: string }> }; roleArchetype: string; jobId: string | null } => Boolean(entry));

  const total = parsed.length;
  const withHard = parsed.filter((entry) => (entry.evaluation.hardBlockers?.length || 0) > 0);
  const withWarnings = parsed.filter((entry) => (entry.evaluation.warnings?.length || 0) > 0);
  const totalWarnings = parsed.reduce((sum, entry) => sum + (entry.evaluation.warnings?.length || 0), 0);
  const pageOverflow = parsed.filter((entry) =>
    (entry.evaluation.warnings || []).some((warning) => warning.code === "page_budget_overflow")
  );

  const archetypeScores = new Map<string, number[]>();
  for (const entry of parsed) {
    const score = entry.evaluation.overallScore;
    if (typeof score !== "number") continue;
    const list = archetypeScores.get(entry.roleArchetype) || [];
    list.push(score);
    archetypeScores.set(entry.roleArchetype, list);
  }

  const jobsWithValidV2 = new Set(
    parsed
      .filter((entry) => (entry.evaluation.hardBlockers?.length || 0) === 0 && entry.jobId)
      .map((entry) => entry.jobId as string)
  );

  return {
    evaluatedResumeCount: total,
    hardGroundingViolationRate: total > 0 ? withHard.length / total : 0,
    softWarningRate: total > 0 ? withWarnings.length / total : 0,
    averageWarningsPerGeneratedResume: total > 0 ? totalWarnings / total : 0,
    pageBudgetOverflowRate: total > 0 ? pageOverflow.length / total : 0,
    averageQualityByRoleArchetype: Array.from(archetypeScores.entries()).map(([roleArchetype, scores]) => ({
      roleArchetype,
      averageQuality: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      count: scores.length,
    })),
    shareOfJobsWithValidV2Resumes: totalJobs > 0 ? jobsWithValidV2.size / totalJobs : 0,
  };
}
