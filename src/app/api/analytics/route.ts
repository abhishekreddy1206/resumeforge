import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET() {
  const [
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
  ] = await Promise.all([
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
    db.$queryRaw<Array<{ skill: string; totalCost: number; totalInput: number; totalOutput: number; calls: number }>>`
      SELECT skill, SUM(costUsd) as totalCost, SUM(inputTokens) as totalInput, SUM(outputTokens) as totalOutput, COUNT(*) as calls
      FROM TokenUsage GROUP BY skill ORDER BY totalCost DESC
    `,
    db.$queryRaw<Array<{ model: string; totalCost: number; calls: number }>>`
      SELECT model, SUM(costUsd) as totalCost, COUNT(*) as calls
      FROM TokenUsage GROUP BY model ORDER BY totalCost DESC
    `,
    db.profileVersion.findMany({
      select: {
        id: true, score: true, delta: true, label: true, createdAt: true,
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
      select: { id: true, skills: true, terminologyMap: true, matchResult: true },
    }),
    db.skill.findMany({
      select: { name: true, category: true },
    }),
    db.profileVersion.findMany({
      select: { jobId: true, score: true, delta: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Compute funnel
  const matchedJobs = allJobs.filter((j) => j.matchResult !== null).length;
  const jobsWithVersions = new Set(allVersions.map((v) => v.jobId));
  const optimizedJobs = jobsWithVersions.size;

  // Compute skill gaps
  const skillFrequency = new Map<string, number>();
  const profileSkillNames = new Set(profileSkills.map((s) => s.name.toLowerCase()));
  const synonymToCanonical = new Map<string, string>();

  for (const job of allJobs) {
    const tMap = safeJsonParse(job.terminologyMap, []) as Array<{ jdTerm: string; resumeSynonyms: string[] }>;
    if (Array.isArray(tMap)) {
      for (const entry of tMap) {
        for (const syn of entry.resumeSynonyms) {
          synonymToCanonical.set(syn.toLowerCase(), entry.jdTerm.toLowerCase());
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
      for (const pSkill of profileSkillNames) {
        if (synonymToCanonical.get(pSkill) === skill) {
          return { skill, frequency, status: "partial" as const, profileSkill: pSkill };
        }
      }
      return { skill, frequency, status: "gap" as const };
    });

  // Compute ATS trends
  const versionsByJob = new Map<string, Array<{ score: number; delta: number | null; createdAt: Date }>>();
  for (const v of allVersions) {
    const arr = versionsByJob.get(v.jobId) || [];
    arr.push(v);
    versionsByJob.set(v.jobId, arr);
  }

  let totalInitial = 0;
  let totalFinal = 0;
  let totalImprovement = 0;
  let jobsWithScores = 0;
  const scoreBuckets = new Map<string, number>();

  for (const [, jobVersions] of versionsByJob) {
    if (jobVersions.length === 0) continue;
    const initial = jobVersions[0].score;
    const final = jobVersions[jobVersions.length - 1].score;
    totalInitial += initial;
    totalFinal += final;
    totalImprovement += final - initial;
    jobsWithScores++;
    const bucket = `${Math.floor(final / 10) * 10}-${Math.floor(final / 10) * 10 + 9}`;
    scoreBuckets.set(bucket, (scoreBuckets.get(bucket) || 0) + 1);
  }

  const atsTrends = {
    averageInitialScore: jobsWithScores > 0 ? Math.round(totalInitial / jobsWithScores) : 0,
    averageFinalScore: jobsWithScores > 0 ? Math.round(totalFinal / jobsWithScores) : 0,
    averageImprovement: jobsWithScores > 0 ? Math.round(totalImprovement / jobsWithScores) : 0,
    jobCount: jobsWithScores,
    distribution: Array.from(scoreBuckets.entries())
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => a.range.localeCompare(b.range)),
  };

  return NextResponse.json({
    funnel: { totalJobs, matchedJobs, optimizedJobs, appliedJobs, weeklyAdded },
    skillGaps,
    atsTrends,
    tokenUsage: {
      daily: tokenRows.map((r) => ({
        day: r.day,
        cost: Number(r.totalCost),
        inputTokens: Number(r.totalInput),
        outputTokens: Number(r.totalOutput),
        calls: Number(r.calls),
      })),
      totals: {
        cost: totalTokenAgg._sum.costUsd ?? 0,
        inputTokens: totalTokenAgg._sum.inputTokens ?? 0,
        outputTokens: totalTokenAgg._sum.outputTokens ?? 0,
        calls: totalTokenAgg._count,
      },
      bySkill: bySkill.map((r) => ({
        skill: r.skill,
        cost: Number(r.totalCost),
        inputTokens: Number(r.totalInput),
        outputTokens: Number(r.totalOutput),
        calls: Number(r.calls),
      })),
      byModel: byModel.map((r) => ({
        model: r.model,
        cost: Number(r.totalCost),
        calls: Number(r.calls),
      })),
    },
    versions,
    resumeCount,
  });
}
