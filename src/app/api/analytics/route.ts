import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";

export async function GET() {
  const [
    tokenRows,
    totalTokenAgg,
    bySkill,
    byModel,
    versions,
    resumeCount,
  ] = await Promise.all([
    // Daily token usage (last 30 days)
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
    // Totals
    db.tokenUsage.aggregate({
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    // By skill
    db.$queryRaw<Array<{ skill: string; totalCost: number; totalInput: number; totalOutput: number; calls: number }>>`
      SELECT
        skill,
        SUM(costUsd) as totalCost,
        SUM(inputTokens) as totalInput,
        SUM(outputTokens) as totalOutput,
        COUNT(*) as calls
      FROM TokenUsage
      GROUP BY skill
      ORDER BY totalCost DESC
    `,
    // By model
    db.$queryRaw<Array<{ model: string; totalCost: number; calls: number }>>`
      SELECT
        model,
        SUM(costUsd) as totalCost,
        COUNT(*) as calls
      FROM TokenUsage
      GROUP BY model
      ORDER BY totalCost DESC
    `,
    // Profile versions with job info
    db.profileVersion.findMany({
      select: {
        id: true,
        score: true,
        delta: true,
        label: true,
        createdAt: true,
        job: { select: { id: true, title: true, company: true } },
        resumes: { select: { id: true, format: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // Total resumes
    db.resume.count(),
  ]);

  return NextResponse.json({
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
