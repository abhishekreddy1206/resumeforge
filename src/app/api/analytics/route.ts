import { NextResponse, after } from "next/server";
import { prisma as db } from "@/lib/db";
import { summarizeInsightsForAnalytics, getInsightsData } from "@/lib/insights";
import {
  isPlaceholderJob,
  summarizeJobsBySource,
  summarizeMatchTrends,
  summarizeQualityHealth,
  summarizeResumeQualityTrends,
} from "@/lib/dashboard-analytics";
import { SavedSourceChangeType } from "@/generated/prisma/enums";
import { safeJsonParse } from "@/lib/utils/json";
import { computeSourceEffectiveness } from "@/lib/source-effectiveness";

export async function GET() {
  const [
    insights,
    insightsProfileMeta,
    sourceEffectiveness,
    tokenRows,
    totalTokenAgg,
    bySkill,
    byModel,
    versions,
    resumeCount,
    totalJobs,
    appliedJobs,
    weeklyAdded,
    allJobs,
    profileSkills,
    allVersions,
    evaluatedResumes,
    totalGuides,
    completedGuides,
    inProgressGuides,
    totalPaths,
    totalSavedSources,
    savedSourceHeads,
    staleGuideSources,
    manualEdits,
  ] = await Promise.all([
    getInsightsData({ cacheOnly: true }),
    db.profile.findFirst({ select: { cachedInsightsAt: true } }),
    computeSourceEffectiveness(),
    db.$queryRaw<Array<{ day: string; totalCost: number; totalInput: number; totalOutput: number; calls: number }>>`
      SELECT
        date(createdAt) as day,
        SUM(costUsd) as totalCost,
        SUM(inputTokens) as totalInput,
        SUM(outputTokens) as totalOutput,
        COUNT(*) as calls
      FROM TokenUsage
      WHERE createdAt >= datetime('now', '-30 days')
      GROUP BY date(createdAt)
      ORDER BY day ASC
    `,
    db.tokenUsage.aggregate({
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    db.$queryRaw<Array<{ skill: string; totalCost: number; totalInput: number; totalOutput: number; calls: number; cacheReads: number; cacheCreations: number }>>`
      SELECT skill, SUM(costUsd) as totalCost, SUM(inputTokens) as totalInput, SUM(outputTokens) as totalOutput, COUNT(*) as calls,
        SUM(cacheReadInputTokens) as cacheReads, SUM(cacheCreationInputTokens) as cacheCreations
      FROM TokenUsage GROUP BY skill ORDER BY totalCost DESC
    `,
    db.$queryRaw<Array<{ model: string; totalCost: number; calls: number }>>`
      SELECT model, SUM(costUsd) as totalCost, COUNT(*) as calls
      FROM TokenUsage GROUP BY model ORDER BY totalCost DESC
    `,
    db.profileVersion.findMany({
      select: {
        id: true,
        score: true,
        scoreVersion: true,
        delta: true,
        label: true,
        createdAt: true,
        job: { select: { id: true, title: true, company: true } },
        resumes: { select: { id: true, format: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.resume.count(),
    db.job.count(),
    db.job.count({ where: { applied: true } }),
    db.job.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    db.job.findMany({
      select: {
        id: true,
        title: true,
        company: true,
        description: true,
        source: true,
        skills: true,
        terminologyMap: true,
        matchResult: true,
      },
    }),
    db.skill.findMany({
      select: { name: true, category: true },
    }),
    db.profileVersion.findMany({
      select: { jobId: true, score: true, scoreVersion: true, delta: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.resume.findMany({
      select: {
        jobId: true,
        evaluation: true,
        evaluationStatus: true,
        evaluationVersion: true,
        job: { select: { roleArchetype: true } },
      },
    }),
    db.guide.count(),
    db.guide.count({ where: { completionStatus: "completed" } }),
    db.guide.count({ where: { completionStatus: "in_progress" } }),
    db.learningPath.count(),
    db.savedSource.count({ where: { deletedAt: null } }),
    db.savedSource.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        reviewFlags: true,
        captureMethod: true,
      },
    }),
    db.guideSource.findMany({
      where: {
        isActive: true,
        savedSourceId: { not: null },
      },
      select: {
        guideId: true,
        savedSourceVersion: { select: { version: true } },
        savedSource: { select: { version: true } },
      },
    }),
    db.savedSourceVersion.count({ where: { changeType: SavedSourceChangeType.manual_edit } }),
  ]);

  // Mirror /api/insights: if we served cached insights, kick off a background
  // refresh so subsequent polls see fresh data. The home page polls every 30s,
  // so the revalidating window closes quickly.
  let insightsRevalidating = false;
  if (insights !== null) {
    insightsRevalidating = true;
    after(async () => {
      try {
        await getInsightsData({ force: true });
      } catch {
        // background refresh failure is non-fatal — next poll will retry
      }
    });
  }

  const matchedJobs = allJobs.filter((job) => job.matchResult !== null).length;
  const optimizedJobs = new Set(allVersions.filter((version) => version.scoreVersion === 2).map((version) => version.jobId)).size;

  const skillFrequency = new Map<string, number>();
  const profileSkillNames = new Set(profileSkills.map((skill) => skill.name.toLowerCase()));
  const synonymToCanonical = new Map<string, string>();

  for (const job of allJobs) {
    const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{ jdTerm: string; resumeSynonyms: string[] }>;
    if (Array.isArray(terminologyMap)) {
      for (const entry of terminologyMap) {
        for (const synonym of entry.resumeSynonyms) {
          synonymToCanonical.set(synonym.toLowerCase(), entry.jdTerm.toLowerCase());
        }
      }
    }
    const jobSkills = safeJsonParse(job.skills, []) as string[];
    if (Array.isArray(jobSkills)) {
      for (const skill of jobSkills) {
        const key = skill.toLowerCase();
        skillFrequency.set(key, (skillFrequency.get(key) || 0) + 1);
      }
    }
  }

  const skillGaps = Array.from(skillFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([skill, frequency]) => {
      if (profileSkillNames.has(skill)) {
        return { skill, frequency, status: "strong" as const };
      }
      const canonical = synonymToCanonical.get(skill);
      if (canonical && profileSkillNames.has(canonical)) {
        return { skill, frequency, status: "strong" as const, profileSkill: canonical };
      }
      for (const profileSkill of profileSkillNames) {
        if (synonymToCanonical.get(profileSkill) === skill) {
          return { skill, frequency, status: "partial" as const, profileSkill };
        }
      }
      return { skill, frequency, status: "gap" as const };
    });

  const matchTrends = summarizeMatchTrends(allJobs);
  const resumeQualityTrends = summarizeResumeQualityTrends(allVersions);
  const qualityHealth = summarizeQualityHealth(
    evaluatedResumes.map((resume) => ({
      evaluation: resume.evaluation,
      evaluationStatus: resume.evaluationStatus,
      evaluationVersion: resume.evaluationVersion,
      roleArchetype: resume.job.roleArchetype,
      jobId: resume.jobId,
    })),
    totalJobs
  );

  const needsReview = savedSourceHeads.filter((source) => source.reviewFlags !== "[]").length;
  const domFallback = savedSourceHeads.filter((source) => source.captureMethod === "dom_fallback").length;
  const staleGuideAttachments = staleGuideSources.filter((source) => {
    const attachedVersion = source.savedSourceVersion?.version ?? null;
    const headVersion = source.savedSource?.version ?? null;
    return attachedVersion !== null && headVersion !== null && attachedVersion < headVersion;
  });
  const guidesWithStaleSources = new Set(staleGuideAttachments.map((source) => source.guideId)).size;
  const placeholderJobs = allJobs.filter((job) =>
    isPlaceholderJob({
      title: job.title || "",
      company: job.company || "",
      description: job.description || "",
    })
  ).length;
  const insightSummary = summarizeInsightsForAnalytics(insights);
  const scoreVersionsPresent = Array.from(
    new Set(allVersions.map((version) => version.scoreVersion).filter((value): value is number => typeof value === "number"))
  ).sort((a, b) => a - b);

  return NextResponse.json({
    funnel: { totalJobs, matchedJobs, optimizedJobs, appliedJobs, weeklyAdded },
    skillGaps,
    matchTrends,
    resumeQualityTrends,
    qualityHealth,
    scoreVersionsPresent,
    compatibility: {
      legacyViewAvailable: scoreVersionsPresent.includes(1),
      v2ViewAvailable: scoreVersionsPresent.includes(2),
      legacyVersionCount: allVersions.filter((version) => version.scoreVersion === 1).length,
      v2VersionCount: allVersions.filter((version) => version.scoreVersion === 2).length,
    },
    tokenUsage: {
      daily: tokenRows.map((row) => ({
        day: row.day,
        cost: Number(row.totalCost),
        inputTokens: Number(row.totalInput),
        outputTokens: Number(row.totalOutput),
        calls: Number(row.calls),
      })),
      totals: {
        cost: totalTokenAgg._sum.costUsd ?? 0,
        inputTokens: totalTokenAgg._sum.inputTokens ?? 0,
        outputTokens: totalTokenAgg._sum.outputTokens ?? 0,
        calls: totalTokenAgg._count,
      },
      bySkill: bySkill.map((row) => ({
        skill: row.skill,
        cost: Number(row.totalCost),
        inputTokens: Number(row.totalInput),
        outputTokens: Number(row.totalOutput),
        calls: Number(row.calls),
        cacheReads: Number(row.cacheReads || 0),
        cacheCreations: Number(row.cacheCreations || 0),
      })),
      byModel: byModel.map((row) => ({
        model: row.model,
        cost: Number(row.totalCost),
        calls: Number(row.calls),
      })),
    },
    versions,
    resumeCount,
    insights: insightSummary,
    learn: {
      totalGuides,
      completedGuides,
      inProgressGuides,
      totalPaths,
      savedSources: totalSavedSources,
    },
    sourceHealth: {
      needsReview,
      domFallback,
      staleGuideAttachments: staleGuideAttachments.length,
      guidesWithStaleSources,
      manualEdits,
    },
    capture: {
      jobsBySource: summarizeJobsBySource(allJobs.map((job) => ({ source: job.source }))),
      placeholderJobs,
    },
    cachedAt: {
      insights: insightsProfileMeta?.cachedInsightsAt?.toISOString() ?? null,
    },
    sectionsRevalidating: insightsRevalidating ? ["insights"] : [],
    sourceEffectiveness,
  });
}
