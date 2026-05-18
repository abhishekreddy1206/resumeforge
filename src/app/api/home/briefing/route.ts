import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils/json";
import { evaluateRules, type BriefingJob, type BriefingState, type Prompt } from "@/lib/briefing-rules";
import { computeWeekOverWeekTrends, type TrendMover } from "@/lib/home-trends";
import { generateBriefingPrompts } from "@/lib/claude/skills/briefing-advisor";
import { createLogger } from "@/lib/logger";
import { createHash } from "crypto";

const log = createLogger("home-briefing");

const MIN_JOBS_FOR_BRIEFING = 5;
const AI_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface BriefingResponse {
  prompts: Prompt[];
  trends: TrendMover[];
  cachedAt: string | null; // ISO; null when no cache (rules-only path)
}

export async function GET(): Promise<NextResponse<BriefingResponse>> {
  const profile = await prisma.profile.findFirst({
    select: {
      id: true,
      cachedBriefingPrompts: true,
      cachedBriefingPromptsAt: true,
      briefingFingerprint: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ prompts: [], trends: [], cachedAt: null });
  }

  const state = await loadBriefingState();
  if (state.jobs.length < MIN_JOBS_FOR_BRIEFING) {
    return NextResponse.json({ prompts: [], trends: [], cachedAt: null });
  }

  // 1. Run hand-coded rules first
  const ruleBasedPrompts = evaluateRules(state);
  let prompts: Prompt[] = ruleBasedPrompts;
  let aiCachedAt: Date | null = null;

  // 2. Fall back to AI ONLY if zero rules fired
  if (ruleBasedPrompts.length === 0) {
    const fp = computeBriefingFingerprint(state);
    const ageMs = profile.cachedBriefingPromptsAt
      ? Date.now() - profile.cachedBriefingPromptsAt.getTime()
      : Infinity;
    const cacheValid =
      profile.briefingFingerprint === fp &&
      profile.cachedBriefingPrompts &&
      ageMs < AI_CACHE_MAX_AGE_MS;

    if (cacheValid) {
      const cached = safeJsonParse<Prompt[]>(profile.cachedBriefingPrompts!, []);
      prompts = cached;
      aiCachedAt = profile.cachedBriefingPromptsAt;
    } else {
      try {
        const out = await generateBriefingPrompts(state);
        prompts = out.prompts;
        const now = new Date();
        aiCachedAt = now;
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            cachedBriefingPrompts: JSON.stringify(prompts),
            cachedBriefingPromptsAt: now,
            briefingFingerprint: fp,
          },
        });
      } catch (err) {
        log.warn("ai_fallback_failed", { error: err instanceof Error ? err.message : String(err) });
        // Fall back to a static "healthy" message
        prompts = [{
          id: "healthy",
          priority: 5,
          emoji: "🟢",
          text: "No urgent action — pipeline is healthy.",
        }];
      }
    }
  }

  // 3. Compute W/W trends (always; cheap)
  const trends = await computeWeekOverWeekTrends();

  return NextResponse.json({
    prompts,
    trends,
    cachedAt: aiCachedAt?.toISOString() ?? null,
  });
}

async function loadBriefingState(): Promise<BriefingState> {
  const now = new Date();
  const [jobs, versions] = await Promise.all([
    prisma.job.findMany({
      select: {
        id: true,
        applied: true,
        appliedAt: true,
        callbackReceived: true,
        callbackAt: true,
        rejected: true,
        rejectedAt: true,
        matchResult: true,
        matchedAt: true,
        createdAt: true,
        archived: true,
      },
    }),
    prisma.profileVersion.findMany({
      select: { score: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50, // recent versions only
    }),
  ]);

  const briefingJobs: BriefingJob[] = jobs.map((j) => ({
    id: j.id,
    applied: j.applied,
    appliedAt: j.appliedAt,
    callbackReceived: j.callbackReceived,
    callbackAt: j.callbackAt,
    rejected: j.rejected,
    rejectedAt: j.rejectedAt,
    matchScore: extractMatchScore(j.matchResult),
    matchedAt: j.matchedAt,
    createdAt: j.createdAt,
    archived: j.archived,
  }));

  return {
    jobs: briefingJobs,
    recentProfileVersions: versions.map((v) => ({ score: v.score, createdAt: v.createdAt })),
    now,
  };
}

function extractMatchScore(matchResultJson: string | null): number | null {
  if (!matchResultJson) return null;
  const parsed = safeJsonParse<{ overallScore?: number; score?: number } | null>(matchResultJson, null);
  if (!parsed) return null;
  if (typeof parsed.overallScore === "number") return parsed.overallScore;
  if (typeof parsed.score === "number") return parsed.score;
  return null;
}

/**
 * Fingerprint for the AI fallback cache. We only cache the AI output;
 * if any of the state buckets change (job counts, recent application timing),
 * the fingerprint moves and a fresh call fires.
 */
function computeBriefingFingerprint(state: BriefingState): string {
  const summary = {
    jobsCount: state.jobs.length,
    appliedCount: state.jobs.filter((j) => j.applied).length,
    rejectedCount: state.jobs.filter((j) => j.rejected).length,
    callbacksOpen: state.jobs.filter((j) => j.callbackReceived && !j.rejected).length,
    matchedCount: state.jobs.filter((j) => j.matchedAt !== null).length,
    unscoredCount: state.jobs.filter((j) => j.matchScore === null && !j.rejected).length,
    // Day-resolution timing: prevents fingerprint churn from second-level timestamps
    daysSinceLastApp: (() => {
      const applied = state.jobs.filter((j) => j.applied && j.appliedAt !== null);
      if (applied.length === 0) return null;
      applied.sort((a, b) => (b.appliedAt!.getTime() - a.appliedAt!.getTime()));
      return Math.floor((state.now.getTime() - applied[0].appliedAt!.getTime()) / (24 * 60 * 60 * 1000));
    })(),
    versionsCount: state.recentProfileVersions.length,
  };
  return createHash("sha256").update(JSON.stringify(summary)).digest("hex").slice(0, 16);
}
