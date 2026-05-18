// Hand-coded rules for the home page Briefing Hero. Pure functions over
// BriefingState — no DB, no I/O. The route handler assembles state from
// Prisma and calls evaluateRules.

export interface BriefingJob {
  id: string;
  applied: boolean;
  appliedAt: Date | null;
  callbackReceived: boolean;
  callbackAt: Date | null;
  rejected: boolean;
  rejectedAt: Date | null;
  matchScore: number | null; // parsed from Job.matchResult (overallScore || score)
  matchedAt: Date | null;
  createdAt: Date;
  archived: boolean;
}

export interface BriefingProfileVersion {
  score: number;
  createdAt: Date;
}

export interface BriefingState {
  jobs: BriefingJob[];
  recentProfileVersions: BriefingProfileVersion[]; // sorted asc by createdAt
  now: Date; // injected for testability
}

export interface Prompt {
  id: string;
  priority: 1 | 2 | 3 | 4 | 5; // lower = more urgent
  text: string;
  href?: string;
  emoji?: string;
}

export interface Rule {
  id: string;
  evaluate(state: BriefingState): Prompt | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const unappliedHighMatches: Rule = {
  id: "unapplied_high_matches",
  evaluate({ jobs }) {
    const candidates = jobs.filter(
      (j) =>
        !j.applied &&
        !j.rejected &&
        !j.archived &&
        typeof j.matchScore === "number" &&
        j.matchScore >= 75,
    );
    if (candidates.length < 5) return null;
    return {
      id: "unapplied_high_matches",
      priority: 1,
      emoji: "⚠",
      text: `${candidates.length} matched jobs over 75% haven't been applied to.`,
      href: "/top-matches",
    };
  },
};

const qualityRegression: Rule = {
  id: "quality_regression",
  evaluate({ recentProfileVersions }) {
    if (recentProfileVersions.length < 3) return null;
    // Last 3 in chronological order (asc by createdAt)
    const last3 = recentProfileVersions.slice(-3);
    const [a, b, c] = last3;
    // Monotonic decrease: a > b > c (strictly), total drop ≥ 8 points
    if (!(a.score > b.score && b.score > c.score)) return null;
    const drop = Math.round(a.score - c.score);
    if (drop < 8) return null;
    return {
      id: "quality_regression",
      priority: 2,
      emoji: "📉",
      text: `Avg résumé quality dropped ${drop} pts on your last 3 jobs.`,
    };
  },
};

const inactivity: Rule = {
  id: "inactivity",
  evaluate({ jobs, now }) {
    const hasHistoricalApplied = jobs.some((j) => j.applied && j.appliedAt !== null);
    if (!hasHistoricalApplied) return null;
    const recent = jobs.some(
      (j) => j.applied && j.appliedAt !== null && daysBetween(now, j.appliedAt) < 7,
    );
    if (recent) return null;
    // Find the most recent applied job to surface days-since
    const latest = jobs
      .filter((j) => j.applied && j.appliedAt !== null)
      .sort((a, b) => (b.appliedAt!.getTime() - a.appliedAt!.getTime()))[0];
    const days = daysBetween(now, latest.appliedAt!);
    return {
      id: "inactivity",
      priority: 2,
      emoji: "⏳",
      text: `No applications in ${days} days.`,
      href: "/top-matches",
    };
  },
};

const staleCallbacks: Rule = {
  id: "stale_callbacks",
  evaluate({ jobs, now }) {
    const stale = jobs.filter(
      (j) =>
        j.callbackReceived &&
        !j.rejected &&
        j.callbackAt !== null &&
        daysBetween(now, j.callbackAt) > 14,
    );
    if (stale.length === 0) return null;
    const s = stale.length === 1 ? "" : "s";
    return {
      id: "stale_callbacks",
      priority: 1,
      emoji: "📞",
      text: `${stale.length} callback${s} more than 14 days old without a decision.`,
    };
  },
};

const bottleneck: Rule = {
  id: "bottleneck",
  evaluate({ jobs, now }) {
    const stuck = jobs.filter(
      (j) =>
        j.matchedAt !== null &&
        !j.applied &&
        !j.rejected &&
        !j.archived &&
        daysBetween(now, j.matchedAt) > 30,
    );
    if (stuck.length === 0) return null;
    const s = stuck.length === 1 ? "" : "s";
    return {
      id: "bottleneck",
      priority: 3,
      emoji: "⌛",
      text: `${stuck.length} matched job${s} over 30 days old. Archive or apply?`,
    };
  },
};

const unscoredJobs: Rule = {
  id: "unscored_jobs",
  evaluate({ jobs }) {
    const unscored = jobs.filter(
      (j) => j.matchScore === null && !j.rejected && !j.archived,
    );
    if (unscored.length < 10) return null;
    return {
      id: "unscored_jobs",
      priority: 3,
      emoji: "🔢",
      text: `${unscored.length} jobs haven't been matched yet.`,
    };
  },
};

export const BRIEFING_RULES: Rule[] = [
  unappliedHighMatches,
  qualityRegression,
  inactivity,
  staleCallbacks,
  bottleneck,
  unscoredJobs,
];

export function evaluateRules(state: BriefingState): Prompt[] {
  const fired: Prompt[] = [];
  for (const r of BRIEFING_RULES) {
    const p = r.evaluate(state);
    if (p !== null) fired.push(p);
  }
  return fired.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
