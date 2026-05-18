import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils/json";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const PCT_CHANGE_CAP = 999; // sentinel for divide-by-zero (0 → N>0)

export interface TrendsInput {
  now: Date;
  // Each array contains every timestamp we care about (could be more than 14 days
  // old — the helper filters by window). All dates in UTC.
  appliedAtTimestamps: Date[];
  matchedAtTimestamps: Date[];
  rejectedAtTimestamps: Date[];
  callbackAtTimestamps: Date[];
  // For averages: pre-bucketed score arrays per window. The bucketing happens
  // upstream so this helper stays pure (no need to filter by score availability).
  matchScoresInCurrentWeek: number[];
  matchScoresInPriorWeek: number[];
  qualityScoresInCurrentWeek: number[];
  qualityScoresInPriorWeek: number[];
}

export interface TrendMover {
  metric: string;       // "Applied" | "Matched" | "Rejected" | "Callbacks" | "Avg Match" | "Avg Quality"
  current: number;      // current-week value (count or average)
  prior: number;        // prior-week value
  pctChange: number;    // rounded; +999 when prior=0 and current>0; 0 when both 0; -100 when current=0 and prior>0
  countChange: number;  // current - prior, rounded
}

function inWindow(ts: Date, start: number, end: number): boolean {
  const t = ts.getTime();
  return t >= start && t < end;
}

function countInWindow(arr: Date[], start: number, end: number): number {
  let count = 0;
  for (const ts of arr) if (inWindow(ts, start, end)) count++;
  return count;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pctChange(current: number, prior: number): number {
  if (prior === 0 && current === 0) return 0;
  if (prior === 0) return PCT_CHANGE_CAP;
  return Math.round(((current - prior) / prior) * 100);
}

function buildMover(metric: string, current: number, prior: number): TrendMover | null {
  // Skip entirely if both windows are zero — no movement to report
  if (current === 0 && prior === 0) return null;
  return {
    metric,
    current: Math.round(current),
    prior: Math.round(prior),
    pctChange: pctChange(current, prior),
    countChange: Math.round(current - prior),
  };
}

/**
 * Pure helper: build TrendMover[] from already-bucketed input arrays.
 * The DB-fetching wrapper `computeWeekOverWeekTrends()` builds the input
 * shape from Prisma queries.
 */
export function computeWeekOverWeekTrendsFromData(input: TrendsInput): TrendMover[] {
  const nowMs = input.now.getTime();
  const currentStart = nowMs - WEEK_MS;
  const currentEnd = nowMs;
  const priorStart = nowMs - 2 * WEEK_MS;
  const priorEnd = nowMs - WEEK_MS;

  const movers: Array<TrendMover | null> = [
    buildMover(
      "Applied",
      countInWindow(input.appliedAtTimestamps, currentStart, currentEnd),
      countInWindow(input.appliedAtTimestamps, priorStart, priorEnd),
    ),
    buildMover(
      "Matched",
      countInWindow(input.matchedAtTimestamps, currentStart, currentEnd),
      countInWindow(input.matchedAtTimestamps, priorStart, priorEnd),
    ),
    buildMover(
      "Rejected",
      countInWindow(input.rejectedAtTimestamps, currentStart, currentEnd),
      countInWindow(input.rejectedAtTimestamps, priorStart, priorEnd),
    ),
    buildMover(
      "Callbacks",
      countInWindow(input.callbackAtTimestamps, currentStart, currentEnd),
      countInWindow(input.callbackAtTimestamps, priorStart, priorEnd),
    ),
    buildMover(
      "Avg Match",
      avg(input.matchScoresInCurrentWeek),
      avg(input.matchScoresInPriorWeek),
    ),
    buildMover(
      "Avg Quality",
      avg(input.qualityScoresInCurrentWeek),
      avg(input.qualityScoresInPriorWeek),
    ),
  ];

  return movers
    .filter((m): m is TrendMover => m !== null)
    .sort((a, b) => {
      const ad = Math.abs(a.pctChange);
      const bd = Math.abs(b.pctChange);
      if (ad !== bd) return bd - ad;
      return Math.abs(b.countChange) - Math.abs(a.countChange);
    })
    .slice(0, 3);
}

/**
 * DB-fetching wrapper. Single-user app: no profile filter on Job table.
 * The "now" parameter is injected for testability.
 */
export async function computeWeekOverWeekTrends(now: Date = new Date()): Promise<TrendMover[]> {
  const nowMs = now.getTime();
  const cutoff14d = new Date(nowMs - 2 * WEEK_MS);

  // Load the relevant timestamp columns + matchResult JSON for jobs touched in the last 14d.
  // Two parallel queries: one for jobs (covers Applied/Matched/Rejected/Callbacks/Avg Match),
  // one for ProfileVersion (covers Avg Quality).
  const [jobs, versions] = await Promise.all([
    prisma.job.findMany({
      where: {
        OR: [
          { appliedAt: { gte: cutoff14d } },
          { matchedAt: { gte: cutoff14d } },
          { rejectedAt: { gte: cutoff14d } },
          { callbackAt: { gte: cutoff14d } },
        ],
      },
      select: {
        appliedAt: true,
        matchedAt: true,
        rejectedAt: true,
        callbackAt: true,
        matchResult: true,
      },
    }),
    prisma.profileVersion.findMany({
      where: { createdAt: { gte: cutoff14d } },
      select: { score: true, createdAt: true },
    }),
  ]);

  // Bucketize raw timestamps
  const appliedAtTimestamps: Date[] = [];
  const matchedAtTimestamps: Date[] = [];
  const rejectedAtTimestamps: Date[] = [];
  const callbackAtTimestamps: Date[] = [];
  const matchScoresInCurrentWeek: number[] = [];
  const matchScoresInPriorWeek: number[] = [];

  const currentStart = nowMs - WEEK_MS;
  const priorStart = nowMs - 2 * WEEK_MS;

  for (const j of jobs) {
    if (j.appliedAt) appliedAtTimestamps.push(j.appliedAt);
    if (j.matchedAt) {
      matchedAtTimestamps.push(j.matchedAt);
      // For Avg Match, bucket by matchedAt and extract score
      const score = extractMatchScore(j.matchResult);
      if (score !== null) {
        const t = j.matchedAt.getTime();
        if (t >= currentStart && t < nowMs) matchScoresInCurrentWeek.push(score);
        else if (t >= priorStart && t < currentStart) matchScoresInPriorWeek.push(score);
      }
    }
    if (j.rejectedAt) rejectedAtTimestamps.push(j.rejectedAt);
    if (j.callbackAt) callbackAtTimestamps.push(j.callbackAt);
  }

  const qualityScoresInCurrentWeek: number[] = [];
  const qualityScoresInPriorWeek: number[] = [];
  for (const v of versions) {
    const t = v.createdAt.getTime();
    if (t >= currentStart && t < nowMs) qualityScoresInCurrentWeek.push(v.score);
    else if (t >= priorStart && t < currentStart) qualityScoresInPriorWeek.push(v.score);
  }

  return computeWeekOverWeekTrendsFromData({
    now,
    appliedAtTimestamps,
    matchedAtTimestamps,
    rejectedAtTimestamps,
    callbackAtTimestamps,
    matchScoresInCurrentWeek,
    matchScoresInPriorWeek,
    qualityScoresInCurrentWeek,
    qualityScoresInPriorWeek,
  });
}

function extractMatchScore(matchResultJson: string | null): number | null {
  if (!matchResultJson) return null;
  const parsed = safeJsonParse<{ overallScore?: number; score?: number } | null>(
    matchResultJson,
    null,
  );
  if (!parsed) return null;
  if (typeof parsed.overallScore === "number") return parsed.overallScore;
  if (typeof parsed.score === "number") return parsed.score;
  return null;
}
