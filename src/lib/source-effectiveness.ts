import { prisma } from "@/lib/db";
import { normalizeJobSource } from "@/lib/dashboard-analytics";
import { isRejectionReasonKey, type RejectionReasonKey } from "@/lib/rejection-reasons";

const MIN_JOBS_PER_SOURCE = 3;
const OTHER_LABEL = "Other";
const TOP_REASON_MIN_REJECTIONS = 3;

export interface SourceJobInput {
  source: string | null;
  applied: boolean;
  callbackReceived: boolean;
  rejected: boolean;
  rejectionReason: RejectionReasonKey | string | null;
  matchResult: string | null; // raw JSON string from Job.matchResult
}

export interface SourceRow {
  source: string;
  jobs: number;
  avgMatch: number | null;       // mean overallScore (or .score fallback); null if no scored jobs
  appliedPct: number;            // applied / jobs * 100, rounded
  callbackPct: number;           // callbackReceived / applied * 100 (rounded); 0 if no applied
  rejectedPct: number;           // rejected / applied * 100 (rounded); 0 if no applied
  topRejectionReason: RejectionReasonKey | null; // null when bucket has <3 rejections with known reasons
}

/**
 * Pure aggregation: groups jobs by normalized source, drops noise sources
 * (<3 jobs) into a synthetic "Other" row, and computes conversion stats.
 *
 *   appliedPct denominator: total jobs from source ("how many were worth pursuing?")
 *   callbackPct / rejectedPct denominator: applied jobs ("of what I pursued, what % converted?")
 *
 * This isolates source quality (raw lead value) from conversion quality
 * (how I performed after applying).
 */
export function computeSourceEffectivenessFromJobs(jobs: SourceJobInput[]): SourceRow[] {
  if (jobs.length === 0) return [];

  // Group by normalized source
  const buckets = new Map<string, SourceJobInput[]>();
  for (const j of jobs) {
    const key = normalizeJobSource(j.source);
    const arr = buckets.get(key) ?? [];
    arr.push(j);
    buckets.set(key, arr);
  }

  // Split into kept sources vs noise (collapsed into Other)
  const kept: SourceRow[] = [];
  const otherJobs: SourceJobInput[] = [];

  for (const [source, sourceJobs] of buckets.entries()) {
    if (sourceJobs.length < MIN_JOBS_PER_SOURCE) {
      otherJobs.push(...sourceJobs);
    } else {
      kept.push(computeRowForBucket(source, sourceJobs));
    }
  }

  // Sort kept rows by jobs desc, tie-break alphabetically
  kept.sort((a, b) => b.jobs - a.jobs || a.source.localeCompare(b.source));

  // Append Other at the bottom if any noise sources existed
  if (otherJobs.length > 0) {
    kept.push(computeRowForBucket(OTHER_LABEL, otherJobs));
  }

  return kept;
}

function computeRowForBucket(source: string, sourceJobs: SourceJobInput[]): SourceRow {
  const totalJobs = sourceJobs.length;
  const appliedCount = sourceJobs.filter((j) => j.applied).length;
  const callbackCount = sourceJobs.filter((j) => j.callbackReceived).length;
  const rejectedCount = sourceJobs.filter((j) => j.rejected).length;

  // avgMatch: parse each matchResult and average .overallScore (or .score fallback)
  const scores: number[] = [];
  for (const j of sourceJobs) {
    if (!j.matchResult) continue;
    try {
      const parsed = JSON.parse(j.matchResult) as { overallScore?: number; score?: number };
      const v = typeof parsed.overallScore === "number" ? parsed.overallScore
              : typeof parsed.score === "number" ? parsed.score
              : null;
      if (v !== null) scores.push(v);
    } catch {
      // malformed — skip
    }
  }
  const avgMatch = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  // topRejectionReason: most-common reason among rejected jobs with known reasons,
  // only if there are at least TOP_REASON_MIN_REJECTIONS such jobs
  const reasonCounts = new Map<RejectionReasonKey, number>();
  let knownReasonRejections = 0;
  for (const j of sourceJobs) {
    if (!j.rejected) continue;
    if (!isRejectionReasonKey(j.rejectionReason)) continue;
    knownReasonRejections++;
    reasonCounts.set(j.rejectionReason, (reasonCounts.get(j.rejectionReason) ?? 0) + 1);
  }
  let topRejectionReason: RejectionReasonKey | null = null;
  if (knownReasonRejections >= TOP_REASON_MIN_REJECTIONS) {
    let bestCount = 0;
    for (const [reason, count] of reasonCounts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        topRejectionReason = reason;
      }
    }
  }

  return {
    source,
    jobs: totalJobs,
    avgMatch,
    appliedPct: Math.round((appliedCount / totalJobs) * 100),
    callbackPct: appliedCount > 0 ? Math.round((callbackCount / appliedCount) * 100) : 0,
    rejectedPct: appliedCount > 0 ? Math.round((rejectedCount / appliedCount) * 100) : 0,
    topRejectionReason,
  };
}

/**
 * Convenience wrapper that pulls the right shape from Prisma.
 * Called by the /api/analytics route.
 */
export async function computeSourceEffectiveness(profileId: string): Promise<SourceRow[]> {
  const jobs = await prisma.job.findMany({
    where: { profileId },
    select: {
      source: true,
      applied: true,
      callbackReceived: true,
      rejected: true,
      rejectionReason: true,
      matchResult: true,
    },
  });
  return computeSourceEffectivenessFromJobs(jobs);
}
