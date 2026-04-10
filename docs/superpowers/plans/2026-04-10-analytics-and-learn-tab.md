# Analytics Reimagination & Learn Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the token-usage-centric dashboard with job search intelligence (funnel, skill gaps, ATS trends) and add a new Learn tab for AI-generated interactive study guides with learning paths and gap-based recommendations.

**Architecture:** Two independent subsystems sharing the existing Prisma/SQLite backend. Analytics extends the existing `/api/analytics` endpoint with new aggregations from Job, ProfileVersion, and Skill tables — no schema changes. Learn tab adds four new Prisma models (LearningPath, Guide, GuideVersion, GuideSource), two AI skills, and a new `/learn` page with guide renderer components. The gap analysis connection bridges both features via the existing `gap-aggregator` skill.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui, Prisma/SQLite, recharts (new), prismjs (new), Claude AI via CLI subprocess.

**Spec:** `docs/superpowers/specs/2026-04-10-analytics-and-learn-tab-design.md`

---

## File Map

### Analytics (Feature 1)

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/app/api/analytics/route.ts` | Add funnel, skillGaps, atsTrends queries |
| Modify | `src/app/page.tsx` | Redesign dashboard with new sections |
| Create | `src/components/analytics/funnel-chart.tsx` | Job search funnel visualization |
| Create | `src/components/analytics/skill-gap-chart.tsx` | Skill gap heatmap bars |
| Create | `src/components/analytics/ats-trend-chart.tsx` | ATS score trend chart |
| Create | `src/components/analytics/stat-card.tsx` | Reusable stat card component |

### Learn Tab (Feature 2)

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `prisma/schema.prisma` | Add LearningPath, Guide, GuideVersion, GuideSource models |
| Create | `src/lib/claude/skills/guide-generator.ts` | AI guide generation and refinement |
| Create | `src/lib/claude/skills/guide-recommender.ts` | AI topic recommendations from gaps |
| Modify | `src/lib/claude/index.ts` | Re-export new skills |
| Create | `src/app/api/learn/guides/route.ts` | Guide list + create |
| Create | `src/app/api/learn/guides/[id]/route.ts` | Guide get/update/delete |
| Create | `src/app/api/learn/guides/[id]/refine/route.ts` | Guide refinement with new sources |
| Create | `src/app/api/learn/guides/[id]/evaluate/route.ts` | Open-ended answer evaluation |
| Create | `src/app/api/learn/paths/route.ts` | Learning path list + create |
| Create | `src/app/api/learn/paths/[id]/route.ts` | Learning path get/update/delete |
| Create | `src/app/api/learn/recommendations/route.ts` | AI-recommended topics |
| Create | `src/app/learn/page.tsx` | Learn tab home page |
| Create | `src/app/learn/[slug]/page.tsx` | Individual guide viewer |
| Create | `src/components/learn/guide-renderer.tsx` | Top-level guide JSON → React |
| Create | `src/components/learn/section-block.tsx` | Single section renderer |
| Create | `src/components/learn/code-example.tsx` | Syntax-highlighted code block |
| Create | `src/components/learn/quiz-card.tsx` | Interactive quiz component |
| Create | `src/components/learn/open-ended-prompt.tsx` | AI-evaluated open-ended answer |
| Create | `src/components/learn/interview-scenario.tsx` | Staged reveal interview prep |
| Create | `src/components/learn/progress-tracker.tsx` | Section completion sidebar |
| Create | `src/components/learn/refine-panel.tsx` | Source addition panel |
| Modify | `src/components/nav-links.tsx` | Add Learn tab |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts and prismjs**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npm install recharts prismjs @types/prismjs
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && node -e "require('recharts'); require('prismjs'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add package.json package-lock.json && git commit -m "chore: add recharts and prismjs dependencies"
```

---

## Task 2: Extend Analytics API

**Files:**
- Modify: `src/app/api/analytics/route.ts`

- [ ] **Step 1: Add funnel, skill gaps, and ATS trends queries**

Replace the entire content of `src/app/api/analytics/route.ts` with:

```typescript
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
    // New analytics queries
    totalJobs,
    appliedJobs,
    weeklyAdded,
    allJobs,
    profileSkills,
    allVersions,
  ] = await Promise.all([
    // --- EXISTING: Token usage ---
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

    // --- NEW: Funnel counts ---
    db.job.count(),
    db.job.count({ where: { applied: true } }),
    db.job.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),

    // --- NEW: All jobs for skill gap + funnel analysis ---
    db.job.findMany({
      select: {
        id: true,
        skills: true,
        terminologyMap: true,
        matchResult: true,
      },
    }),

    // --- NEW: Profile skills for gap comparison ---
    db.skill.findMany({
      select: { name: true, category: true },
    }),

    // --- NEW: All profile versions for ATS trends ---
    db.profileVersion.findMany({
      select: { jobId: true, score: true, delta: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // --- Compute funnel ---
  const matchedJobs = allJobs.filter((j) => j.matchResult !== null).length;
  const jobsWithVersions = new Set(allVersions.map((v) => v.jobId));
  const optimizedJobs = jobsWithVersions.size;

  // --- Compute skill gaps ---
  const skillFrequency = new Map<string, number>();
  const profileSkillNames = new Set(profileSkills.map((s) => s.name.toLowerCase()));

  // Build a synonym → canonical map from terminologyMaps
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

    // Count skill frequency across jobs
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
      // Check if profile has this skill directly
      if (profileSkillNames.has(skill)) {
        return { skill, frequency, status: "strong" as const };
      }
      // Check if profile has a synonym
      const canonical = synonymToCanonical.get(skill);
      if (canonical && profileSkillNames.has(canonical)) {
        return { skill, frequency, status: "strong" as const, profileSkill: canonical };
      }
      // Check reverse: does any profile skill map to this JD skill?
      for (const pSkill of profileSkillNames) {
        if (synonymToCanonical.get(pSkill) === skill) {
          return { skill, frequency, status: "partial" as const, profileSkill: pSkill };
        }
      }
      return { skill, frequency, status: "gap" as const };
    });

  // --- Compute ATS trends ---
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

    // Bucket the final score
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
    // NEW
    funnel: {
      totalJobs,
      matchedJobs,
      optimizedJobs,
      appliedJobs,
      weeklyAdded,
    },
    skillGaps,
    atsTrends,

    // EXISTING (unchanged shape)
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
```

- [ ] **Step 2: Verify the API returns new fields**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build 2>&1 | tail -5
```

Expected: Build succeeds (or only unrelated warnings).

Then start dev server and test:

```bash
curl -s http://localhost:3000/api/analytics | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('funnel:', JSON.stringify(j.funnel)); console.log('skillGaps count:', j.skillGaps?.length); console.log('atsTrends:', JSON.stringify(j.atsTrends));"
```

Expected: `funnel: {totalJobs:N, matchedJobs:N, ...}`, skillGaps count and atsTrends populated.

- [ ] **Step 3: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/app/api/analytics/route.ts && git commit -m "feat(analytics): add funnel, skill gaps, and ATS trends to analytics API"
```

---

## Task 3: Create Analytics Chart Components

**Files:**
- Create: `src/components/analytics/stat-card.tsx`
- Create: `src/components/analytics/funnel-chart.tsx`
- Create: `src/components/analytics/skill-gap-chart.tsx`
- Create: `src/components/analytics/ats-trend-chart.tsx`

- [ ] **Step 1: Create stat-card component**

```typescript
// src/components/analytics/stat-card.tsx
"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendColor?: string;
}

export function StatCard({ label, value, trend, trendColor = "text-muted-foreground" }: StatCardProps) {
  return (
    <div className="bg-card border rounded-lg p-4 text-center">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {trend && <div className={`text-xs mt-1 ${trendColor}`}>{trend}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create funnel-chart component**

```typescript
// src/components/analytics/funnel-chart.tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface FunnelData {
  totalJobs: number;
  matchedJobs: number;
  optimizedJobs: number;
  appliedJobs: number;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981"];
const LABELS = ["Added", "Matched", "Optimized", "Applied"];

export function FunnelChart({ data }: { data: FunnelData }) {
  const chartData = [
    { stage: "Added", value: data.totalJobs },
    { stage: "Matched", value: data.matchedJobs },
    { stage: "Optimized", value: data.optimizedJobs },
    { stage: "Applied", value: data.appliedJobs },
  ];

  const rates = [
    null,
    data.totalJobs > 0 ? Math.round((data.matchedJobs / data.totalJobs) * 100) : 0,
    data.matchedJobs > 0 ? Math.round((data.optimizedJobs / data.matchedJobs) * 100) : 0,
    data.optimizedJobs > 0 ? Math.round((data.appliedJobs / data.optimizedJobs) * 100) : 0,
  ];

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Job Search Funnel</h3>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} layout="horizontal" barCategoryGap="20%">
          <XAxis dataKey="stage" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={LABELS[i]} fill={COLORS[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-2 text-xs text-muted-foreground px-2">
        {rates.map((rate, i) => (
          <span key={LABELS[i]}>{rate !== null ? `${rate}%` : ""}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create skill-gap-chart component**

```typescript
// src/components/analytics/skill-gap-chart.tsx
"use client";

interface SkillGap {
  skill: string;
  frequency: number;
  status: "strong" | "partial" | "gap";
  profileSkill?: string;
}

const STATUS_COLORS: Record<string, { bar: string; label: string; text: string }> = {
  strong: { bar: "bg-green-500", label: "Strong", text: "text-green-500" },
  partial: { bar: "bg-amber-500", label: "Partial", text: "text-amber-500" },
  gap: { bar: "bg-red-500", label: "Gap", text: "text-red-500" },
};

export function SkillGapChart({ data }: { data: SkillGap[] }) {
  const maxFreq = Math.max(...data.map((d) => d.frequency), 1);

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-1">Skill Gap Analysis</h3>
      <p className="text-xs text-muted-foreground mb-3">Skills most requested across your jobs vs your profile</p>
      <div className="space-y-2">
        {data.map((item) => {
          const colors = STATUS_COLORS[item.status];
          const widthPct = (item.frequency / maxFreq) * 100;
          return (
            <div key={item.skill} className="flex items-center gap-2">
              <span className="text-xs w-24 truncate text-foreground" title={item.skill}>{item.skill}</span>
              <div className="flex-1 bg-muted rounded h-4 overflow-hidden">
                <div className={`${colors.bar} h-full rounded transition-all`} style={{ width: `${widthPct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground w-4 text-right">{item.frequency}</span>
              <span className={`text-xs w-12 ${colors.text}`}>{colors.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ats-trend-chart component**

```typescript
// src/components/analytics/ats-trend-chart.tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface ATSTrends {
  averageInitialScore: number;
  averageFinalScore: number;
  averageImprovement: number;
  jobCount: number;
  distribution: Array<{ range: string; count: number }>;
}

export function ATSTrendChart({ data }: { data: ATSTrends }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-1">ATS Score Trends</h3>
      <p className="text-xs text-muted-foreground mb-3">Score distribution across optimized jobs</p>
      {data.jobCount === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No optimization data yet. Match and optimize jobs to see trends.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={data.distribution} barCategoryGap="20%">
              <XAxis dataKey="range" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [`${value} jobs`, "Count"]}
              />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2 text-xs">
            <span className="text-muted-foreground">Avg initial: <span className="text-foreground font-medium">{data.averageInitialScore}</span></span>
            <span className="text-muted-foreground">Avg final: <span className="text-foreground font-medium">{data.averageFinalScore}</span></span>
            <span className="text-green-500 font-medium">+{data.averageImprovement} pts avg improvement across {data.jobCount} jobs</span>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify components compile**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors in the new files.

- [ ] **Step 6: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/components/analytics/ && git commit -m "feat(analytics): add chart components for funnel, skill gaps, and ATS trends"
```

---

## Task 4: Redesign Dashboard Page

**Files:**
- Modify: `src/app/page.tsx`

This is the largest single task. The dashboard page is 681 lines. We replace the analytics-focused sections with the new layout while preserving the hero, onboarding, profile versions, recent jobs, and skills overview sections.

- [ ] **Step 1: Rewrite the dashboard page**

Replace the entire content of `src/app/page.tsx`. The new version:
- Keeps the existing `Profile`, `Job`, and skeleton interfaces
- Adds the new analytics response fields to the `AnalyticsData` interface
- Replaces the 3 stat cards with 4 new hero stat cards
- Replaces the AI Usage section with: funnel chart, two-column insights (skill gaps + ATS trends), and a collapsible AI Usage section
- Preserves: hero greeting, "How it works", profile versions, recent jobs, skills overview

```typescript
// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/analytics/stat-card";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { SkillGapChart } from "@/components/analytics/skill-gap-chart";
import { ATSTrendChart } from "@/components/analytics/ats-trend-chart";
import {
  Briefcase,
  CheckCircle,
  Target,
  FileText,
  ChevronDown,
  ChevronRight,
  Sparkles,
  User,
  ArrowRight,
} from "lucide-react";

interface Skill {
  id: string;
  name: string;
  category: string;
}

interface Experience {
  id: string;
  company: string;
  title: string;
}

interface Profile {
  id: string;
  name: string;
  email?: string;
  skills: Skill[];
  experiences: Experience[];
}

interface Job {
  id: string;
  title: string;
  company: string;
  applied: boolean;
  resumes: { id: string }[];
}

interface AnalyticsData {
  funnel: {
    totalJobs: number;
    matchedJobs: number;
    optimizedJobs: number;
    appliedJobs: number;
    weeklyAdded: number;
  };
  skillGaps: Array<{
    skill: string;
    frequency: number;
    status: "strong" | "partial" | "gap";
    profileSkill?: string;
  }>;
  atsTrends: {
    averageInitialScore: number;
    averageFinalScore: number;
    averageImprovement: number;
    jobCount: number;
    distribution: Array<{ range: string; count: number }>;
  };
  tokenUsage: {
    daily: Array<{ day: string; cost: number; inputTokens: number; outputTokens: number; calls: number }>;
    totals: { cost: number; inputTokens: number; outputTokens: number; calls: number };
    bySkill: Array<{ skill: string; cost: number; inputTokens: number; outputTokens: number; calls: number }>;
    byModel: Array<{ model: string; cost: number; calls: number }>;
  };
  versions: Array<{
    id: string;
    score: number;
    delta: number | null;
    label: string | null;
    createdAt: string;
    job: { id: string; title: string; company: string };
    resumes: Array<{ id: string; format: string; createdAt: string }>;
  }>;
  resumeCount: number;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-lg" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

function MiniBarChart({ data }: { data: Array<{ day: string; cost: number }> }) {
  const maxCost = Math.max(...data.map((d) => d.cost), 0.001);
  return (
    <div className="flex items-end gap-px h-24">
      {data.map((d) => (
        <div
          key={d.day}
          className="flex-1 bg-primary/60 hover:bg-primary rounded-t transition-colors cursor-pointer group relative"
          style={{ height: `${(d.cost / maxCost) * 100}%`, minHeight: d.cost > 0 ? "2px" : "0px" }}
          title={`${d.day}: $${d.cost.toFixed(4)}`}
        />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiUsageOpen, setAiUsageOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/jobs").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/analytics").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, j, a]) => {
        setProfile(p);
        setJobs(j);
        setAnalytics(a);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <DashboardSkeleton />
      </div>
    );
  }

  const firstName = profile?.name?.split(" ")[0];
  const hasProfile = !!profile;
  const hasJobs = jobs.length > 0;
  const hasAnalytics = !!analytics;

  // Skill categories for the overview
  const skillsByCategory: Record<string, Skill[]> = {};
  if (profile?.skills) {
    for (const skill of profile.skills) {
      const cat = skill.category || "other";
      if (!skillsByCategory[cat]) skillsByCategory[cat] = [];
      skillsByCategory[cat].push(skill);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Hero */}
      <section>
        <h1 className="text-2xl font-bold tracking-tight">
          {firstName ? `Welcome back, ${firstName}` : "Welcome to ResumeForge"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasProfile
            ? "Your job search command center"
            : "AI-powered resume tailoring for every job application"}
        </p>
        {!hasProfile && (
          <div className="mt-4 flex gap-3">
            <a href="/profile" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
              <User className="w-4 h-4" /> Get Started
            </a>
          </div>
        )}
        {hasProfile && !hasJobs && (
          <div className="mt-4">
            <a href="/jobs" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
              <Briefcase className="w-4 h-4" /> Add Your First Job
            </a>
          </div>
        )}
      </section>

      {/* How it Works (new users only) */}
      {!hasProfile && (
        <section className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">How it Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Upload Resume", desc: "Upload your PDF or DOCX resume. AI parses it into a structured profile." },
              { step: "2", title: "Add Jobs", desc: "Paste job URLs or descriptions. AI extracts requirements and scores your fit." },
              { step: "3", title: "Generate", desc: "Generate tailored resumes optimized for each job's ATS keywords." },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="text-2xl font-bold text-primary/30 font-mono">{item.step}</div>
                <div>
                  <div className="font-medium text-sm">{item.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hero Stats */}
      {hasAnalytics && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Jobs"
            value={analytics.funnel.totalJobs - analytics.funnel.appliedJobs}
            trend={`+${analytics.funnel.weeklyAdded} this week`}
            trendColor="text-green-500"
          />
          <StatCard
            label="Applied"
            value={analytics.funnel.appliedJobs}
            trend={analytics.funnel.totalJobs > 0 ? `${Math.round((analytics.funnel.appliedJobs / analytics.funnel.totalJobs) * 100)}% of total` : ""}
          />
          <StatCard
            label="Avg ATS Score"
            value={analytics.atsTrends.averageFinalScore || "—"}
            trend={analytics.atsTrends.averageImprovement > 0 ? `+${analytics.atsTrends.averageImprovement} pts avg improvement` : ""}
            trendColor="text-green-500"
          />
          <StatCard
            label="Resumes Generated"
            value={analytics.resumeCount}
          />
        </section>
      )}

      {/* Funnel */}
      {hasAnalytics && analytics.funnel.totalJobs > 0 && (
        <section>
          <FunnelChart data={analytics.funnel} />
        </section>
      )}

      {/* Two-column insights */}
      {hasAnalytics && (analytics.skillGaps.length > 0 || analytics.atsTrends.jobCount > 0) && (
        <section className="grid md:grid-cols-2 gap-4">
          {analytics.skillGaps.length > 0 && <SkillGapChart data={analytics.skillGaps} />}
          {analytics.atsTrends.jobCount > 0 && <ATSTrendChart data={analytics.atsTrends} />}
        </section>
      )}

      {/* AI Usage (collapsible) */}
      {hasAnalytics && analytics.tokenUsage.totals.calls > 0 && (
        <section className="bg-card border rounded-lg">
          <button
            onClick={() => setAiUsageOpen(!aiUsageOpen)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">AI Usage &amp; Costs</span>
              <span className="text-xs text-muted-foreground">
                Total: ${analytics.tokenUsage.totals.cost.toFixed(2)} · {analytics.tokenUsage.totals.calls} calls
              </span>
            </div>
            {aiUsageOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
          {aiUsageOpen && (
            <div className="px-4 pb-4 space-y-4">
              {/* Daily cost chart */}
              {analytics.tokenUsage.daily.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Daily Cost (Last 30 Days)</h4>
                  <MiniBarChart data={analytics.tokenUsage.daily} />
                </div>
              )}
              {/* Skill and model breakdown side by side */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Cost by Skill</h4>
                  <div className="space-y-1">
                    {analytics.tokenUsage.bySkill.slice(0, 8).map((s) => {
                      const maxCost = analytics.tokenUsage.bySkill[0]?.cost || 1;
                      return (
                        <div key={s.skill} className="flex items-center gap-2">
                          <span className="text-xs w-28 truncate font-mono">{s.skill}</span>
                          <div className="flex-1 bg-muted rounded h-2 overflow-hidden">
                            <div className="bg-primary h-full rounded" style={{ width: `${(s.cost / maxCost) * 100}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-14 text-right">${s.cost.toFixed(3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Cost by Model</h4>
                  <div className="space-y-1">
                    {analytics.tokenUsage.byModel.map((m) => (
                      <div key={m.model} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{m.model}</span>
                        <span className="text-muted-foreground">${m.cost.toFixed(3)} · {m.calls} calls</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Profile Versions */}
      {hasAnalytics && analytics.versions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Profile Versions &amp; Resume History</h2>
          <div className="space-y-2">
            {analytics.versions.slice(0, 10).map((v) => (
              <div key={v.id} className="bg-card border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {v.job.company.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{v.job.title}</div>
                    <div className="text-xs text-muted-foreground">{v.job.company} · {new Date(v.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold">{v.score}</div>
                    {v.delta != null && v.delta > 0 && (
                      <div className="text-xs text-green-500">+{v.delta.toFixed(1)}</div>
                    )}
                  </div>
                  {v.resumes.length > 0 && (
                    <div className="flex gap-1">
                      {v.resumes.map((r) => (
                        <span key={r.id} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono uppercase">{r.format}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Two-column footer: Recent Jobs + Skills */}
      {(hasJobs || (profile?.skills && profile.skills.length > 0)) && (
        <section className="grid md:grid-cols-2 gap-6">
          {hasJobs && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Recent Jobs</h2>
              <div className="space-y-2">
                {jobs.slice(0, 5).map((job) => (
                  <a key={job.id} href="/jobs" className="block bg-card border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{job.title}</div>
                        <div className="text-xs text-muted-foreground">{job.company}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.applied && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                        {job.resumes.length > 0 && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{job.resumes.length} resume{job.resumes.length > 1 ? "s" : ""}</span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
          {profile?.skills && profile.skills.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Skills Overview</h2>
              <div className="space-y-3">
                {Object.entries(skillsByCategory).slice(0, 4).map(([category, skills]) => (
                  <div key={category}>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1">{category}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.slice(0, 8).map((s) => (
                        <span key={s.id} className="text-xs bg-muted px-2 py-0.5 rounded">{s.name}</span>
                      ))}
                      {skills.length > 8 && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">+{skills.length - 8}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the dashboard builds and renders**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build 2>&1 | tail -10
```

Expected: Build succeeds. Then open http://localhost:3000 in a browser and verify:
- Hero stats row shows 4 cards
- Funnel chart renders
- Skill gaps and ATS trends show in two columns
- AI Usage is collapsed by default and expands on click
- Profile versions, recent jobs, and skills overview still render

- [ ] **Step 3: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/app/page.tsx && git commit -m "feat(dashboard): redesign with job search funnel, skill gaps, and ATS trends"
```

---

## Task 5: Add Learn Tab Prisma Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add four new models to the schema**

Append these models at the end of `prisma/schema.prisma`:

```prisma
model LearningPath {
  id          String   @id @default(cuid())
  title       String
  description String?
  guideOrder  String   @default("[]")
  category    String?
  profileId   String
  profile     Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  guides      Guide[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Guide {
  id               String         @id @default(cuid())
  topic            String
  slug             String         @unique
  content          String
  version          Int            @default(1)
  status           String         @default("draft")
  category         String?
  tags             String         @default("[]")
  completionStatus String         @default("not_started")
  sectionProgress  String         @default("{}")
  profileId        String
  profile          Profile        @relation(fields: [profileId], references: [id], onDelete: Cascade)
  learningPathId   String?
  learningPath     LearningPath?  @relation(fields: [learningPathId], references: [id])
  sources          GuideSource[]
  versions         GuideVersion[]
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
}

model GuideVersion {
  id                String   @id @default(cuid())
  guideId           String
  guide             Guide    @relation(fields: [guideId], references: [id], onDelete: Cascade)
  version           Int
  content           String
  changeDescription String?
  createdAt         DateTime @default(now())
}

model GuideSource {
  id        String   @id @default(cuid())
  guideId   String
  guide     Guide    @relation(fields: [guideId], references: [id], onDelete: Cascade)
  type      String
  url       String?
  title     String?
  content   String
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Add relations to the Profile model**

Add these two lines to the `Profile` model in `prisma/schema.prisma`, after the existing `applicationProfile` relation:

```prisma
  guides               Guide[]
  learningPaths        LearningPath[]
```

- [ ] **Step 3: Run the migration**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npx prisma migrate dev --name add_learning_models
```

Expected: Migration creates the 4 new tables. Prisma client regenerates.

- [ ] **Step 4: Verify models are accessible**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && node -e "const { PrismaClient } = require('./src/generated/prisma'); const p = new PrismaClient(); p.guide.count().then(c => { console.log('Guide count:', c); p.\$disconnect(); });"
```

Expected: `Guide count: 0`

- [ ] **Step 5: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add prisma/ src/generated/ && git commit -m "feat(learn): add LearningPath, Guide, GuideVersion, GuideSource models"
```

---

## Task 6: Create AI Skills for Guide Generation

**Files:**
- Create: `src/lib/claude/skills/guide-generator.ts`
- Create: `src/lib/claude/skills/guide-recommender.ts`
- Modify: `src/lib/claude/index.ts`

- [ ] **Step 1: Create guide-generator skill**

```typescript
// src/lib/claude/skills/guide-generator.ts
import { askJson } from "../client";

export interface CodeExample {
  language: string;
  code: string;
  caption: string;
}

export interface QuizCheck {
  type: "quiz";
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface OpenEndedCheck {
  type: "open_ended";
  prompt: string;
  rubric: string;
}

export type KnowledgeCheck = QuizCheck | OpenEndedCheck;

export interface InterviewScenario {
  setup: string;
  hints: string[];
  sampleAnswer: string;
}

export interface GuideSection {
  id: string;
  title: string;
  explanation: string;
  codeExamples: CodeExample[];
  knowledgeChecks: KnowledgeCheck[];
  interviewScenarios: InterviewScenario[];
  keyTakeaways: string[];
}

export interface GuideContent {
  title: string;
  overview: string;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[];
  sections: GuideSection[];
  references: Array<{ title: string; url?: string; description: string }>;
}

export interface RefineResult {
  content: GuideContent;
  changeDescription: string;
}

/**
 * Skill: Guide Generator
 *
 * Generates or refines structured interactive study guides.
 * Generate mode: creates a full guide from a topic + optional sources.
 * Refine mode: enhances an existing guide with new source material.
 */
export async function generateGuide(
  topic: string,
  options?: { sources?: string[]; difficulty?: string; model?: string }
): Promise<GuideContent> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL:\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${s.slice(0, 8000)}`).join("\n\n")}`
    : "";

  const difficultyHint = options?.difficulty
    ? `\nTarget difficulty: ${options.difficulty}`
    : "";

  return askJson<GuideContent>(`You are a senior software engineer and technical interviewer at a top tech company. Create a comprehensive, interactive study guide on the topic below.

TOPIC: ${topic}${difficultyHint}${sourceBlock}

GUIDE STRUCTURE:
Create a deep-dive guide with 4-8 sections that progressively build understanding. Each section MUST include ALL of these elements:

1. EXPLANATION — Clear, thorough markdown prose that builds intuition through concrete examples. Explain the "why" not just the "what". Use analogies. Reference real-world systems (e.g., how Google/Netflix/Uber uses this).

2. CODE EXAMPLES — Real, production-quality code (not toy examples). Show actual implementations, not pseudocode. Include edge case handling. Use Python, Go, Java, or TypeScript as appropriate for the topic.

3. KNOWLEDGE CHECKS — Mix of:
   - "quiz" type: Multiple choice with 4 options, one correct answer (index), and an explanation of WHY
   - "open_ended" type: "Explain X to me as if..." prompts with a rubric for evaluation
   Include 2-4 checks per section.

4. INTERVIEW SCENARIOS — Frame as actual interview questions:
   - Setup: "You're in a system design interview and asked to..."
   - Hints: 3-4 progressive hints (from subtle to direct)
   - Sample answer: A strong candidate's response
   Include 1-2 scenarios per section.

5. KEY TAKEAWAYS — 2-4 bullet points summarizing the most important concepts.

Section IDs must be kebab-case slugs of the title (e.g., "leader-election").

QUALITY BAR:
- Content should prepare someone for FAANG-level technical interviews
- Include real system examples (not generic "Company X")
- Code must compile/run (no syntax errors, no placeholder functions)
- Quiz explanations should teach, not just confirm
- Interview scenarios should be at staff/senior engineer level

Return ONLY valid JSON matching this structure:
{
  "title": "string",
  "overview": "string (2-3 paragraphs)",
  "estimatedMinutes": number,
  "difficulty": "beginner|intermediate|advanced",
  "prerequisites": ["string"],
  "sections": [
    {
      "id": "string (kebab-case)",
      "title": "string",
      "explanation": "string (markdown)",
      "codeExamples": [{"language":"string","code":"string","caption":"string"}],
      "knowledgeChecks": [
        {"type":"quiz","question":"string","options":["string"],"answer":0,"explanation":"string"},
        {"type":"open_ended","prompt":"string","rubric":"string"}
      ],
      "interviewScenarios": [{"setup":"string","hints":["string"],"sampleAnswer":"string"}],
      "keyTakeaways": ["string"]
    }
  ],
  "references": [{"title":"string","url":"string","description":"string"}]
}`, { timeoutMs: 600_000, skill: "guide-generator", model: options?.model });
}

export async function refineGuide(
  existingContent: GuideContent,
  newSources: string[],
  options?: { instructions?: string; model?: string }
): Promise<RefineResult> {
  const instructionBlock = options?.instructions
    ? `\nUSER INSTRUCTIONS: ${options.instructions}`
    : "";

  return askJson<RefineResult>(`You are a senior software engineer updating an existing study guide with new source material.

EXISTING GUIDE:
${JSON.stringify(existingContent)}

NEW SOURCE MATERIAL:
${newSources.map((s, i) => `--- New Source ${i + 1} ---\n${s.slice(0, 8000)}`).join("\n\n")}${instructionBlock}

TASK:
Analyze the new sources and enhance the existing guide:
- Add new details, examples, or nuance to existing sections where the sources provide deeper coverage
- Add new sections if the sources cover topics not yet in the guide
- Add new code examples from the sources (real implementations, not toy code)
- Add new quiz questions and interview scenarios based on the new material
- Update references to include the new sources
- Keep everything that was already good — don't remove content unless it's factually wrong

If the new sources require restructuring more than 60% of sections, regenerate the entire guide from scratch using all available information (existing + new). State this in the changeDescription.

Return ONLY valid JSON:
{
  "content": { ... same GuideContent structure ... },
  "changeDescription": "string — summarize what changed (e.g., 'Added 2 new sections on X, deepened Y with real-world examples from Z')"
}`, { timeoutMs: 600_000, skill: "guide-generator", model: options?.model });
}
```

- [ ] **Step 2: Create guide-recommender skill**

```typescript
// src/lib/claude/skills/guide-recommender.ts
import { askJson } from "../client";

export interface GuideRecommendation {
  topic: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  gapSkills: string[];
  frequency: number;
}

/**
 * Skill: Guide Recommender
 *
 * Suggests study guide topics based on skill gap analysis.
 * Lightweight — generates recommendations only, not full guides.
 */
export async function recommendGuides(
  gaps: Array<{ gap: string; frequency: number; severity: string; relatedTerms: string[] }>,
  leverageScores: Array<{ skill: string; jobsUnlocked: number; estimatedImpact: string }>,
  existingTopics: string[],
  options?: { model?: string }
): Promise<GuideRecommendation[]> {
  return askJson<GuideRecommendation[]>(`You are a career coach helping a software engineer prioritize technical study topics.

SKILL GAPS (from cross-job analysis):
${JSON.stringify(gaps)}

LEVERAGE SCORES (skills with highest job impact):
${JSON.stringify(leverageScores)}

EXISTING GUIDE TOPICS (already created — skip these):
${JSON.stringify(existingTopics)}

TASK:
Suggest 3-6 study guide topics, ranked by impact on job search success. For each:
- topic: A specific, focused study topic (not too broad). E.g., "Kubernetes Pod Networking" not just "Kubernetes"
- description: 1-2 sentences on what the guide would cover and why it matters for interviews
- difficulty: based on the topic complexity
- gapSkills: which gap skills this guide addresses
- frequency: how many jobs this is relevant to (from the gaps data)

Prioritize topics that:
1. Address high-leverage gaps (unlock the most jobs)
2. Are learnable and demonstrable in interviews
3. Cover fundamentals that compound (not narrow tool-specific knowledge)

Return ONLY a JSON array:
[{"topic":"string","description":"string","difficulty":"beginner|intermediate|advanced","gapSkills":["string"],"frequency":number}]`, { skill: "guide-recommender", model: options?.model });
}
```

- [ ] **Step 3: Add exports to index.ts**

Add these lines at the end of `src/lib/claude/index.ts`:

```typescript
export { generateGuide, refineGuide } from "./skills/guide-generator";
export type { GuideContent, GuideSection, RefineResult } from "./skills/guide-generator";
export { recommendGuides } from "./skills/guide-recommender";
export type { GuideRecommendation } from "./skills/guide-recommender";
```

- [ ] **Step 4: Verify compilation**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/lib/claude/skills/guide-generator.ts src/lib/claude/skills/guide-recommender.ts src/lib/claude/index.ts && git commit -m "feat(learn): add guide-generator and guide-recommender AI skills"
```

---

## Task 7: Create Guide CRUD API Routes

**Files:**
- Create: `src/app/api/learn/guides/route.ts`
- Create: `src/app/api/learn/guides/[id]/route.ts`

- [ ] **Step 1: Create guide list + create route**

```typescript
// src/app/api/learn/guides/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuide } from "@/lib/claude";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { parsePdf } from "@/lib/parsers/pdf";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const pathId = searchParams.get("pathId");

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (status) where.status = status;
    if (pathId) where.learningPathId = pathId;

    const guides = await prisma.guide.findMany({
      where,
      select: {
        id: true, topic: true, slug: true, version: true, status: true,
        category: true, tags: true, completionStatus: true,
        learningPathId: true, createdAt: true, updatedAt: true,
        _count: { select: { sources: true, versions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Parse JSON fields for response
    const result = guides.map((g) => ({
      ...g,
      tags: JSON.parse(g.tags),
      sourceCount: g._count.sources,
      versionCount: g._count.versions,
      _count: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Guide list error:", error);
    return NextResponse.json({ error: "Failed to list guides" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const body = await request.json();
    const { topic, sources, difficulty, model } = body as {
      topic: string;
      sources?: Array<{ type: string; content?: string; url?: string }>;
      difficulty?: string;
      model?: string;
    };

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    // Extract source texts
    const sourceTexts: string[] = [];
    const sourcesToSave: Array<{ type: string; url?: string; title?: string; content: string }> = [];

    if (sources) {
      for (const src of sources) {
        if (src.type === "text" && src.content) {
          sourceTexts.push(src.content);
          sourcesToSave.push({ type: "text", content: src.content, title: "Pasted text" });
        } else if ((src.type === "url" || src.type === "substack" || src.type === "medium") && src.url) {
          const article = await scrapeArticleUrl(src.url);
          sourceTexts.push(`${article.title}\n\n${article.text}`);
          sourcesToSave.push({ type: src.type, url: src.url, title: article.title, content: article.text });
        } else if (src.type === "pdf" && src.content) {
          // content is base64-encoded PDF
          const buffer = Buffer.from(src.content, "base64");
          const text = await parsePdf(buffer);
          sourceTexts.push(text);
          sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
        }
      }
    }

    // Generate guide content via AI
    const content = await generateGuide(topic, {
      sources: sourceTexts.length > 0 ? sourceTexts : undefined,
      difficulty,
      model,
    });

    // Create slug (ensure unique)
    let slug = slugify(topic);
    const existing = await prisma.guide.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Save guide + sources in a transaction
    const guide = await prisma.$transaction(async (tx) => {
      const g = await tx.guide.create({
        data: {
          topic: topic.trim(),
          slug,
          content: JSON.stringify(content),
          status: "published",
          category: content.difficulty,
          tags: JSON.stringify([]),
          profileId: profile.id,
        },
      });

      // Save sources
      for (const src of sourcesToSave) {
        await tx.guideSource.create({
          data: {
            guideId: g.id,
            type: src.type,
            url: src.url || null,
            title: src.title || null,
            content: src.content,
          },
        });
      }

      return g;
    });

    return NextResponse.json({
      id: guide.id,
      slug: guide.slug,
      topic: guide.topic,
      content,
    });
  } catch (error) {
    console.error("Guide create error:", error);
    return NextResponse.json({ error: "Failed to create guide" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create guide get/update/delete route**

```typescript
// src/app/api/learn/guides/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({
      where: { id },
      include: {
        sources: {
          select: { id: true, type: true, url: true, title: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        versions: {
          select: { id: true, version: true, changeDescription: true, createdAt: true },
          orderBy: { version: "desc" },
        },
      },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...guide,
      content: JSON.parse(guide.content),
      tags: JSON.parse(guide.tags),
      sectionProgress: JSON.parse(guide.sectionProgress),
    });
  } catch (error) {
    console.error("Guide get error:", error);
    return NextResponse.json({ error: "Failed to get guide" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, category, tags, completionStatus, sectionProgress } = body;

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (category !== undefined) data.category = category;
    if (tags !== undefined) data.tags = JSON.stringify(tags);
    if (completionStatus !== undefined) data.completionStatus = completionStatus;
    if (sectionProgress !== undefined) data.sectionProgress = JSON.stringify(sectionProgress);

    const guide = await prisma.guide.update({ where: { id }, data });
    return NextResponse.json(guide);
  } catch (error) {
    console.error("Guide update error:", error);
    return NextResponse.json({ error: "Failed to update guide" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.guide.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Guide delete error:", error);
    return NextResponse.json({ error: "Failed to delete guide" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/app/api/learn/ && git commit -m "feat(learn): add guide CRUD API routes"
```

---

## Task 8: Create Guide Refine and Evaluate API Routes

**Files:**
- Create: `src/app/api/learn/guides/[id]/refine/route.ts`
- Create: `src/app/api/learn/guides/[id]/evaluate/route.ts`

- [ ] **Step 1: Create refine route**

```typescript
// src/app/api/learn/guides/[id]/refine/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refineGuide } from "@/lib/claude";
import type { GuideContent } from "@/lib/claude";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { parsePdf } from "@/lib/parsers/pdf";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({
      where: { id },
      include: { sources: true },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const body = await request.json();
    const { sources, instructions, model } = body as {
      sources: Array<{ type: string; content?: string; url?: string }>;
      instructions?: string;
      model?: string;
    };

    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return NextResponse.json({ error: "At least one source is required" }, { status: 400 });
    }

    // Extract new source texts
    const newSourceTexts: string[] = [];
    const sourcesToSave: Array<{ type: string; url?: string; title?: string; content: string }> = [];

    for (const src of sources) {
      if (src.type === "text" && src.content) {
        newSourceTexts.push(src.content);
        sourcesToSave.push({ type: "text", content: src.content, title: "Pasted text" });
      } else if ((src.type === "url" || src.type === "substack" || src.type === "medium") && src.url) {
        const article = await scrapeArticleUrl(src.url);
        newSourceTexts.push(`${article.title}\n\n${article.text}`);
        sourcesToSave.push({ type: src.type, url: src.url, title: article.title, content: article.text });
      } else if (src.type === "pdf" && src.content) {
        const buffer = Buffer.from(src.content, "base64");
        const text = await parsePdf(buffer);
        newSourceTexts.push(text);
        sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
      }
    }

    const existingContent = JSON.parse(guide.content) as GuideContent;

    // Refine via AI
    const result = await refineGuide(existingContent, newSourceTexts, { instructions, model });

    // Save old version, update guide, save new sources in a transaction
    const newVersion = guide.version + 1;
    await prisma.$transaction(async (tx) => {
      // Snapshot current version
      await tx.guideVersion.create({
        data: {
          guideId: guide.id,
          version: guide.version,
          content: guide.content,
          changeDescription: null,
        },
      });

      // Update guide with new content
      await tx.guide.update({
        where: { id: guide.id },
        data: {
          content: JSON.stringify(result.content),
          version: newVersion,
        },
      });

      // Save new sources
      for (const src of sourcesToSave) {
        await tx.guideSource.create({
          data: {
            guideId: guide.id,
            type: src.type,
            url: src.url || null,
            title: src.title || null,
            content: src.content,
          },
        });
      }
    });

    return NextResponse.json({
      version: newVersion,
      content: result.content,
      changeDescription: result.changeDescription,
    });
  } catch (error) {
    console.error("Guide refine error:", error);
    return NextResponse.json({ error: "Failed to refine guide" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create evaluate route**

```typescript
// src/app/api/learn/guides/[id]/evaluate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { askJson } from "@/lib/claude/client";
import type { GuideContent } from "@/lib/claude";

interface EvaluationResult {
  score: number;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({ where: { id } });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const body = await request.json();
    const { sectionId, promptIndex, userAnswer } = body as {
      sectionId: string;
      promptIndex: number;
      userAnswer: string;
    };

    if (!sectionId || promptIndex === undefined || !userAnswer) {
      return NextResponse.json({ error: "sectionId, promptIndex, and userAnswer are required" }, { status: 400 });
    }

    const content = JSON.parse(guide.content) as GuideContent;
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    const openEndedChecks = section.knowledgeChecks.filter((k) => k.type === "open_ended");
    const check = openEndedChecks[promptIndex];
    if (!check || check.type !== "open_ended") {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    const result = await askJson<EvaluationResult>(`You are a senior technical interviewer evaluating a candidate's answer.

TOPIC: ${guide.topic}
SECTION: ${section.title}
PROMPT: ${check.prompt}
RUBRIC: ${check.rubric}

CANDIDATE'S ANSWER:
${userAnswer}

Evaluate the answer against the rubric. Be constructive but honest.

Return ONLY valid JSON:
{
  "score": number (1-5, where 5 is exceptional),
  "strengths": ["string — what they got right"],
  "improvements": ["string — what they missed or could improve"],
  "modelAnswer": "string — a strong reference answer for comparison"
}`, { skill: "guide-evaluate" });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Guide evaluate error:", error);
    return NextResponse.json({ error: "Failed to evaluate answer" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/app/api/learn/guides/[id]/ && git commit -m "feat(learn): add guide refine and evaluate API routes"
```

---

## Task 9: Create Learning Paths and Recommendations API Routes

**Files:**
- Create: `src/app/api/learn/paths/route.ts`
- Create: `src/app/api/learn/paths/[id]/route.ts`
- Create: `src/app/api/learn/recommendations/route.ts`

- [ ] **Step 1: Create learning paths list + create route**

```typescript
// src/app/api/learn/paths/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const paths = await prisma.learningPath.findMany({
      include: {
        guides: {
          select: {
            id: true, topic: true, slug: true, completionStatus: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = paths.map((p) => {
      const guideOrder = JSON.parse(p.guideOrder) as string[];
      const completed = p.guides.filter((g) => g.completionStatus === "completed").length;
      return {
        ...p,
        guideOrder,
        guideCount: p.guides.length,
        completedCount: completed,
        progress: p.guides.length > 0 ? Math.round((completed / p.guides.length) * 100) : 0,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Paths list error:", error);
    return NextResponse.json({ error: "Failed to list learning paths" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, guideIds, category } = body as {
      title: string;
      description?: string;
      guideIds?: string[];
      category?: string;
    };

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const path = await prisma.learningPath.create({
      data: {
        title: title.trim(),
        description: description || null,
        category: category || null,
        guideOrder: JSON.stringify(guideIds || []),
        profileId: profile.id,
      },
    });

    // Link guides to this path if provided
    if (guideIds && guideIds.length > 0) {
      await prisma.guide.updateMany({
        where: { id: { in: guideIds } },
        data: { learningPathId: path.id },
      });
    }

    return NextResponse.json(path);
  } catch (error) {
    console.error("Path create error:", error);
    return NextResponse.json({ error: "Failed to create learning path" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create learning path get/update/delete route**

```typescript
// src/app/api/learn/paths/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const path = await prisma.learningPath.findUnique({
      where: { id },
      include: {
        guides: {
          select: {
            id: true, topic: true, slug: true, completionStatus: true,
            version: true, category: true, updatedAt: true,
          },
        },
      },
    });

    if (!path) {
      return NextResponse.json({ error: "Learning path not found" }, { status: 404 });
    }

    const guideOrder = JSON.parse(path.guideOrder) as string[];
    // Sort guides by the order defined in guideOrder
    const orderedGuides = guideOrder
      .map((gid) => path.guides.find((g) => g.id === gid))
      .filter(Boolean);
    // Append any guides not in the order (newly added)
    const orderedIds = new Set(guideOrder);
    const unordered = path.guides.filter((g) => !orderedIds.has(g.id));

    return NextResponse.json({
      ...path,
      guideOrder,
      guides: [...orderedGuides, ...unordered],
    });
  } catch (error) {
    console.error("Path get error:", error);
    return NextResponse.json({ error: "Failed to get learning path" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, guideOrder, category, addGuideIds, removeGuideIds } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (guideOrder !== undefined) data.guideOrder = JSON.stringify(guideOrder);

    const path = await prisma.learningPath.update({ where: { id }, data });

    if (addGuideIds && Array.isArray(addGuideIds)) {
      await prisma.guide.updateMany({
        where: { id: { in: addGuideIds } },
        data: { learningPathId: id },
      });
    }

    if (removeGuideIds && Array.isArray(removeGuideIds)) {
      await prisma.guide.updateMany({
        where: { id: { in: removeGuideIds }, learningPathId: id },
        data: { learningPathId: null },
      });
    }

    return NextResponse.json(path);
  } catch (error) {
    console.error("Path update error:", error);
    return NextResponse.json({ error: "Failed to update learning path" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Unlink guides first (don't delete them)
    await prisma.guide.updateMany({
      where: { learningPathId: id },
      data: { learningPathId: null },
    });
    await prisma.learningPath.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Path delete error:", error);
    return NextResponse.json({ error: "Failed to delete learning path" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create recommendations route**

```typescript
// src/app/api/learn/recommendations/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aggregateGaps, recommendGuides } from "@/lib/claude";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    // Get matched jobs for gap analysis
    const jobs = await prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: { title: true, company: true, matchResult: true, terminologyMap: true },
    });

    if (jobs.length < 2) {
      return NextResponse.json([]);
    }

    interface MatchBreakdown {
      breakdown?: {
        gaps?: string[];
        bridgeableSkills?: Array<{ jobRequirement: string; yourSkill: string }>;
        directMatches?: string[];
      };
    }

    const jobMatchData = jobs
      .map((job) => {
        const match = safeJsonParse(job.matchResult) as MatchBreakdown | null;
        if (!match?.breakdown) return null;
        return {
          title: job.title,
          company: job.company,
          gaps: match.breakdown.gaps || [],
          bridgeableSkills: (match.breakdown.bridgeableSkills || []).map((b) => ({
            jobRequirement: b.jobRequirement,
            yourSkill: b.yourSkill,
          })),
          directMatches: match.breakdown.directMatches || [],
          terminologyMap: (safeJsonParse(job.terminologyMap, []) as Array<{ jdTerm: string; resumeSynonyms: string[] }>) || [],
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (jobMatchData.length < 2) {
      return NextResponse.json([]);
    }

    // Get gap analysis
    const gapResult = await aggregateGaps(jobMatchData, {});

    // Get existing guide topics to avoid duplicates
    const existingGuides = await prisma.guide.findMany({
      select: { topic: true },
    });
    const existingTopics = existingGuides.map((g) => g.topic);

    // Get AI recommendations
    const recommendations = await recommendGuides(
      gapResult.aggregatedGaps,
      gapResult.leverageScores,
      existingTopics,
    );

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/app/api/learn/ && git commit -m "feat(learn): add learning paths, recommendations API routes"
```

---

## Task 10: Create Guide Viewer Components

**Files:**
- Create: `src/components/learn/code-example.tsx`
- Create: `src/components/learn/quiz-card.tsx`
- Create: `src/components/learn/open-ended-prompt.tsx`
- Create: `src/components/learn/interview-scenario.tsx`
- Create: `src/components/learn/progress-tracker.tsx`
- Create: `src/components/learn/section-block.tsx`
- Create: `src/components/learn/guide-renderer.tsx`
- Create: `src/components/learn/refine-panel.tsx`

- [ ] **Step 1: Create code-example component**

```typescript
// src/components/learn/code-example.tsx
"use client";

import { useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-go";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";

interface CodeExampleProps {
  language: string;
  code: string;
  caption: string;
}

export function CodeExample({ language, code, caption }: CodeExampleProps) {
  const [copied, setCopied] = useState(false);

  const highlighted = (() => {
    const grammar = Prism.languages[language] || Prism.languages.plaintext;
    return Prism.highlight(code, grammar, language);
  })();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between bg-muted px-3 py-1.5">
        <span className="text-xs font-mono text-muted-foreground uppercase">{language}</span>
        <button onClick={handleCopy} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm bg-card">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      {caption && <div className="px-3 py-1.5 text-xs text-muted-foreground border-t">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create quiz-card component**

```typescript
// src/components/learn/quiz-card.tsx
"use client";

import { useState } from "react";

interface QuizCardProps {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  onComplete?: () => void;
}

export function QuizCard({ question, options, answer, explanation, onComplete }: QuizCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const revealed = selected !== null;

  const handleSelect = (index: number) => {
    if (revealed) return;
    setSelected(index);
    if (index === answer) onComplete?.();
  };

  return (
    <div className="my-4 border rounded-lg p-4">
      <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Knowledge Check</div>
      <p className="text-sm font-medium mb-3">{question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          let style = "bg-muted hover:bg-muted/80 cursor-pointer";
          if (revealed) {
            if (i === answer) style = "bg-green-500/10 border-green-500 text-green-700 dark:text-green-400";
            else if (i === selected) style = "bg-red-500/10 border-red-500 text-red-700 dark:text-red-400";
            else style = "bg-muted opacity-50";
          }
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={revealed}
              className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${style}`}
            >
              <span className="font-mono text-xs mr-2">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="mt-3 p-3 bg-muted rounded text-sm">
          <span className="font-medium">{selected === answer ? "Correct!" : "Incorrect."}</span>{" "}
          {explanation}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create open-ended-prompt component**

```typescript
// src/components/learn/open-ended-prompt.tsx
"use client";

import { useState } from "react";

interface OpenEndedPromptProps {
  prompt: string;
  guideId: string;
  sectionId: string;
  promptIndex: number;
  onComplete?: () => void;
}

interface EvalResult {
  score: number;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

export function OpenEndedPrompt({ prompt, guideId, sectionId, promptIndex, onComplete }: OpenEndedPromptProps) {
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!answer.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/learn/guides/${guideId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, promptIndex, userAnswer: answer }),
      });
      if (res.ok) {
        const result = await res.json();
        setEvaluation(result);
        onComplete?.();
      }
    } catch (err) {
      console.error("Evaluation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-4 border rounded-lg p-4">
      <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Open-Ended Question</div>
      <p className="text-sm font-medium mb-3">{prompt}</p>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your answer here..."
        rows={4}
        className="w-full bg-muted border rounded p-3 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
        disabled={!!evaluation}
      />
      {!evaluation && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || loading}
          className="mt-2 bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Evaluating..." : "Check My Answer"}
        </button>
      )}
      {evaluation && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Score:</span>
            <span className="text-sm font-bold">{evaluation.score}/5</span>
          </div>
          {evaluation.strengths.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Strengths</div>
              <ul className="list-disc list-inside text-sm space-y-0.5">
                {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {evaluation.improvements.length > 0 && (
            <div>
              <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Areas for Improvement</div>
              <ul className="list-disc list-inside text-sm space-y-0.5">
                {evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Reference Answer</div>
            <p className="text-sm bg-muted p-3 rounded">{evaluation.modelAnswer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create interview-scenario component**

```typescript
// src/components/learn/interview-scenario.tsx
"use client";

import { useState } from "react";

interface InterviewScenarioProps {
  setup: string;
  hints: string[];
  sampleAnswer: string;
  onComplete?: () => void;
}

export function InterviewScenario({ setup, hints, sampleAnswer, onComplete }: InterviewScenarioProps) {
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(false);

  const revealNextHint = () => {
    if (hintsRevealed < hints.length) {
      setHintsRevealed(hintsRevealed + 1);
    }
  };

  const revealAnswer = () => {
    setAnswerRevealed(true);
    onComplete?.();
  };

  return (
    <div className="my-4 border rounded-lg p-4 border-amber-500/30 bg-amber-500/5">
      <div className="text-xs font-mono text-amber-600 dark:text-amber-400 uppercase mb-2">Interview Scenario</div>
      <p className="text-sm font-medium mb-3">{setup}</p>

      {/* Revealed hints */}
      {hintsRevealed > 0 && (
        <div className="space-y-2 mb-3">
          {hints.slice(0, hintsRevealed).map((hint, i) => (
            <div key={i} className="text-sm bg-muted p-2 rounded">
              <span className="text-xs font-mono text-muted-foreground mr-2">Hint {i + 1}:</span>
              {hint}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {hintsRevealed < hints.length && (
          <button
            onClick={revealNextHint}
            className="text-xs bg-muted hover:bg-muted/80 px-3 py-1.5 rounded transition-colors"
          >
            Show Hint ({hintsRevealed + 1}/{hints.length})
          </button>
        )}
        {!answerRevealed && (
          <button
            onClick={revealAnswer}
            className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded transition-colors"
          >
            Show Sample Answer
          </button>
        )}
      </div>

      {answerRevealed && (
        <div className="mt-3 p-3 bg-muted rounded">
          <div className="text-xs font-medium text-muted-foreground mb-1">Sample Answer</div>
          <p className="text-sm whitespace-pre-wrap">{sampleAnswer}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create progress-tracker component**

```typescript
// src/components/learn/progress-tracker.tsx
"use client";

import type { GuideSection } from "@/lib/claude/skills/guide-generator";

interface SectionProgress {
  quizzesCompleted: number[];
  scenariosRevealed: number[];
}

interface ProgressTrackerProps {
  sections: GuideSection[];
  progress: Record<string, SectionProgress>;
  activeSection?: string;
  onSectionClick: (id: string) => void;
}

export function ProgressTracker({ sections, progress, activeSection, onSectionClick }: ProgressTrackerProps) {
  const getSectionStatus = (section: GuideSection): "completed" | "in_progress" | "not_started" => {
    const p = progress[section.id];
    if (!p) return "not_started";

    const totalQuizzes = section.knowledgeChecks.filter((k) => k.type === "quiz").length;
    const totalScenarios = section.interviewScenarios.length;
    const completedQuizzes = p.quizzesCompleted.length;
    const completedScenarios = p.scenariosRevealed.length;

    if (totalQuizzes + totalScenarios === 0) return "completed";
    if (completedQuizzes >= totalQuizzes && completedScenarios >= totalScenarios) return "completed";
    if (completedQuizzes > 0 || completedScenarios > 0) return "in_progress";
    return "not_started";
  };

  const STATUS_DOT = {
    completed: "bg-green-500",
    in_progress: "bg-amber-500",
    not_started: "bg-muted-foreground/30",
  };

  const completedCount = sections.filter((s) => getSectionStatus(s) === "completed").length;

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground mb-2">
        {completedCount}/{sections.length} sections complete
      </div>
      {sections.map((section) => {
        const status = getSectionStatus(section);
        const isActive = section.id === activeSection;
        return (
          <button
            key={section.id}
            onClick={() => onSectionClick(section.id)}
            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
              isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
            }`}
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
            <span className="truncate">{section.title}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Create section-block component**

```typescript
// src/components/learn/section-block.tsx
"use client";

import { CodeExample } from "./code-example";
import { QuizCard } from "./quiz-card";
import { OpenEndedPrompt } from "./open-ended-prompt";
import { InterviewScenario } from "./interview-scenario";
import type { GuideSection } from "@/lib/claude/skills/guide-generator";

interface SectionBlockProps {
  section: GuideSection;
  guideId: string;
  onQuizComplete?: (sectionId: string, quizIndex: number) => void;
  onScenarioComplete?: (sectionId: string, scenarioIndex: number) => void;
}

export function SectionBlock({ section, guideId, onQuizComplete, onScenarioComplete }: SectionBlockProps) {
  let openEndedIndex = 0;

  return (
    <div id={section.id} className="scroll-mt-24">
      <h2 className="text-xl font-bold mb-4">{section.title}</h2>

      {/* Explanation — render markdown as HTML (basic) */}
      <div
        className="prose prose-sm dark:prose-invert max-w-none mb-6"
        dangerouslySetInnerHTML={{
          __html: section.explanation
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>'),
        }}
      />

      {/* Code Examples */}
      {section.codeExamples.map((ex, i) => (
        <CodeExample key={i} language={ex.language} code={ex.code} caption={ex.caption} />
      ))}

      {/* Knowledge Checks */}
      {section.knowledgeChecks.map((check, i) => {
        if (check.type === "quiz") {
          return (
            <QuizCard
              key={`quiz-${i}`}
              question={check.question}
              options={check.options}
              answer={check.answer}
              explanation={check.explanation}
              onComplete={() => onQuizComplete?.(section.id, i)}
            />
          );
        }
        const idx = openEndedIndex++;
        return (
          <OpenEndedPrompt
            key={`oe-${i}`}
            prompt={check.prompt}
            guideId={guideId}
            sectionId={section.id}
            promptIndex={idx}
            onComplete={() => onQuizComplete?.(section.id, i)}
          />
        );
      })}

      {/* Interview Scenarios */}
      {section.interviewScenarios.map((scenario, i) => (
        <InterviewScenario
          key={i}
          setup={scenario.setup}
          hints={scenario.hints}
          sampleAnswer={scenario.sampleAnswer}
          onComplete={() => onScenarioComplete?.(section.id, i)}
        />
      ))}

      {/* Key Takeaways */}
      {section.keyTakeaways.length > 0 && (
        <div className="my-4 bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="text-xs font-mono text-primary uppercase mb-2">Key Takeaways</div>
          <ul className="list-disc list-inside text-sm space-y-1">
            {section.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create guide-renderer component**

```typescript
// src/components/learn/guide-renderer.tsx
"use client";

import { useState, useCallback } from "react";
import { SectionBlock } from "./section-block";
import { ProgressTracker } from "./progress-tracker";
import type { GuideContent } from "@/lib/claude/skills/guide-generator";

interface SectionProgress {
  quizzesCompleted: number[];
  scenariosRevealed: number[];
}

interface GuideRendererProps {
  guideId: string;
  content: GuideContent;
  initialProgress: Record<string, SectionProgress>;
  onProgressUpdate: (progress: Record<string, SectionProgress>) => void;
}

export function GuideRenderer({ guideId, content, initialProgress, onProgressUpdate }: GuideRendererProps) {
  const [progress, setProgress] = useState<Record<string, SectionProgress>>(initialProgress);
  const [activeSection, setActiveSection] = useState(content.sections[0]?.id);

  const updateProgress = useCallback((newProgress: Record<string, SectionProgress>) => {
    setProgress(newProgress);
    onProgressUpdate(newProgress);
  }, [onProgressUpdate]);

  const handleQuizComplete = useCallback((sectionId: string, quizIndex: number) => {
    const updated = { ...progress };
    if (!updated[sectionId]) {
      updated[sectionId] = { quizzesCompleted: [], scenariosRevealed: [] };
    }
    if (!updated[sectionId].quizzesCompleted.includes(quizIndex)) {
      updated[sectionId] = {
        ...updated[sectionId],
        quizzesCompleted: [...updated[sectionId].quizzesCompleted, quizIndex],
      };
      updateProgress(updated);
    }
  }, [progress, updateProgress]);

  const handleScenarioComplete = useCallback((sectionId: string, scenarioIndex: number) => {
    const updated = { ...progress };
    if (!updated[sectionId]) {
      updated[sectionId] = { quizzesCompleted: [], scenariosRevealed: [] };
    }
    if (!updated[sectionId].scenariosRevealed.includes(scenarioIndex)) {
      updated[sectionId] = {
        ...updated[sectionId],
        scenariosRevealed: [...updated[sectionId].scenariosRevealed, scenarioIndex],
      };
      updateProgress(updated);
    }
  }, [progress, updateProgress]);

  const handleSectionClick = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex gap-8">
      {/* Sidebar */}
      <aside className="hidden lg:block w-56 shrink-0 sticky top-24 self-start">
        <ProgressTracker
          sections={content.sections}
          progress={progress}
          activeSection={activeSection}
          onSectionClick={handleSectionClick}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-12">
        {/* Overview */}
        <div>
          <h1 className="text-2xl font-bold mb-2">{content.title}</h1>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-4">
            <span>{content.estimatedMinutes} min</span>
            <span className="capitalize">{content.difficulty}</span>
            {content.prerequisites.length > 0 && (
              <span>Prerequisites: {content.prerequisites.join(", ")}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content.overview}</p>
        </div>

        {/* Sections */}
        {content.sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            guideId={guideId}
            onQuizComplete={handleQuizComplete}
            onScenarioComplete={handleScenarioComplete}
          />
        ))}

        {/* References */}
        {content.references.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3">References</h2>
            <ul className="space-y-2">
              {content.references.map((ref, i) => (
                <li key={i} className="text-sm">
                  {ref.url ? (
                    <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{ref.title}</a>
                  ) : (
                    <span className="font-medium">{ref.title}</span>
                  )}
                  {ref.description && <span className="text-muted-foreground"> — {ref.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create refine-panel component**

```typescript
// src/components/learn/refine-panel.tsx
"use client";

import { useState } from "react";

interface Source {
  id: string;
  type: string;
  url?: string | null;
  title?: string | null;
  createdAt: string;
}

interface RefinePanelProps {
  guideId: string;
  existingSources: Source[];
  onRefined: () => void;
}

export function RefinePanel({ guideId, existingSources, onRefined }: RefinePanelProps) {
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRefine = async () => {
    if (loading) return;
    const sources = [];
    if (sourceType === "url" && url.trim()) {
      sources.push({ type: "url", url: url.trim() });
    } else if (sourceType === "text" && text.trim()) {
      sources.push({ type: "text", content: text.trim() });
    }
    if (sources.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/learn/guides/${guideId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      if (res.ok) {
        setUrl("");
        setText("");
        setOpen(false);
        onRefined();
      }
    } catch (err) {
      console.error("Refine failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium">Sources &amp; Refinement</span>
        <span className="text-xs text-muted-foreground">{existingSources.length} source{existingSources.length !== 1 ? "s" : ""}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Existing sources */}
          {existingSources.length > 0 && (
            <div className="space-y-1">
              {existingSources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono uppercase bg-muted px-1.5 py-0.5 rounded">{s.type}</span>
                  <span className="truncate">{s.title || s.url || "Text input"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add new source */}
          <div className="border-t pt-3">
            <div className="text-xs font-medium mb-2">Add New Source</div>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setSourceType("url")}
                className={`text-xs px-2 py-1 rounded ${sourceType === "url" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                URL
              </button>
              <button
                onClick={() => setSourceType("text")}
                className={`text-xs px-2 py-1 rounded ${sourceType === "text" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                Text
              </button>
            </div>
            {sourceType === "url" ? (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste article URL (Substack, Medium, blog, etc.)..."
                className="w-full bg-muted border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste text content..."
                rows={3}
                className="w-full bg-muted border rounded px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <button
              onClick={handleRefine}
              disabled={loading || (sourceType === "url" ? !url.trim() : !text.trim())}
              className="mt-2 bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Refining guide..." : "Refine with Source"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Verify compilation**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/components/learn/ && git commit -m "feat(learn): add guide viewer components — code, quiz, open-ended, scenario, progress, refine"
```

---

## Task 11: Create Learn Tab Pages

**Files:**
- Create: `src/app/learn/page.tsx`
- Create: `src/app/learn/[slug]/page.tsx`
- Modify: `src/components/nav-links.tsx`

- [ ] **Step 1: Create learn home page**

```typescript
// src/app/learn/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Sparkles, ArrowRight } from "lucide-react";
import type { GuideRecommendation } from "@/lib/claude/skills/guide-recommender";

interface GuideListItem {
  id: string;
  topic: string;
  slug: string;
  version: number;
  status: string;
  category: string | null;
  tags: string[];
  completionStatus: string;
  sourceCount: number;
  versionCount: number;
  updatedAt: string;
}

interface LearningPathItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  guideCount: number;
  completedCount: number;
  progress: number;
}

export default function LearnPage() {
  const [guides, setGuides] = useState<GuideListItem[]>([]);
  const [paths, setPaths] = useState<LearningPathItem[]>([]);
  const [recommendations, setRecommendations] = useState<GuideRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPathTitle, setNewPathTitle] = useState("");
  const [showNewPath, setShowNewPath] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch("/api/learn/guides").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/learn/paths").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/learn/recommendations").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([g, p, rec]) => {
        setGuides(g);
        setPaths(p);
        setRecommendations(Array.isArray(rec) ? rec : []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (topicText: string) => {
    if (!topicText.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/learn/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = `/learn/${data.slug}`;
      }
    } catch (err) {
      console.error("Create guide failed:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleCreatePath = async () => {
    if (!newPathTitle.trim()) return;
    try {
      await fetch("/api/learn/paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newPathTitle.trim() }),
      });
      setNewPathTitle("");
      setShowNewPath(false);
      fetchData();
    } catch (err) {
      console.error("Create path failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> Learn
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Interactive study guides for technical interview preparation</p>
      </div>

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <section className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">Recommended Based on Your Skill Gaps</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {recommendations.slice(0, 3).map((rec, i) => (
              <div key={i} className="bg-card border rounded-lg p-3">
                <div className="text-xs text-red-500 mb-1">{rec.frequency} jobs mention this</div>
                <div className="text-sm font-semibold mb-1">{rec.topic}</div>
                <div className="text-xs text-muted-foreground mb-2">{rec.description}</div>
                <button
                  onClick={() => handleCreate(rec.topic)}
                  disabled={creating}
                  className="text-xs bg-violet-500 text-white px-3 py-1 rounded hover:bg-violet-600 disabled:opacity-50 transition-colors"
                >
                  Generate Guide
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create New Guide */}
      <section className="bg-card border border-dashed rounded-lg p-6 text-center">
        <div className="text-sm text-foreground mb-2">Create a New Guide</div>
        <div className="flex gap-2 max-w-lg mx-auto">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate(topic)}
            placeholder="Enter a topic (e.g., 'B-trees', 'Raft consensus')..."
            className="flex-1 bg-muted border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={creating}
          />
          <button
            onClick={() => handleCreate(topic)}
            disabled={!topic.trim() || creating}
            className="bg-foreground text-background px-4 py-2 rounded text-sm font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-colors"
          >
            {creating ? "Generating..." : "Generate"}
          </button>
        </div>
      </section>

      {/* Learning Paths */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Learning Paths</h2>
          <button onClick={() => setShowNewPath(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" /> Create Path
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {paths.map((path) => (
            <div key={path.id} className="bg-card border rounded-lg p-4">
              <div className="text-sm font-semibold mb-1">{path.title}</div>
              <div className="text-xs text-muted-foreground mb-2">{path.guideCount} guides · {path.completedCount} completed</div>
              <div className="bg-muted rounded h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${path.progress >= 100 ? "bg-green-500" : path.progress > 0 ? "bg-amber-500" : "bg-muted-foreground/20"}`}
                  style={{ width: `${path.progress}%` }}
                />
              </div>
              <div className="text-xs mt-1" style={{ color: path.progress >= 100 ? "rgb(34 197 94)" : path.progress > 0 ? "rgb(245 158 11)" : undefined }}>
                {path.progress}% complete
              </div>
            </div>
          ))}
          {showNewPath && (
            <div className="bg-card border border-dashed rounded-lg p-4 flex flex-col gap-2">
              <input
                value={newPathTitle}
                onChange={(e) => setNewPathTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePath()}
                placeholder="Path title..."
                className="bg-muted border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleCreatePath} disabled={!newPathTitle.trim()} className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded disabled:opacity-50">
                  Create
                </button>
                <button onClick={() => { setShowNewPath(false); setNewPathTitle(""); }} className="text-xs text-muted-foreground">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {paths.length === 0 && !showNewPath && (
            <div className="bg-card border border-dashed rounded-lg p-4 flex items-center justify-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/50" onClick={() => setShowNewPath(true)}>
              <Plus className="w-4 h-4 mr-1" /> New Path
            </div>
          )}
        </div>
      </section>

      {/* All Guides */}
      <section>
        <h2 className="text-lg font-semibold mb-3">All Guides</h2>
        {guides.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No guides yet. Create your first guide above or generate one from a recommendation.
          </div>
        ) : (
          <div className="space-y-2">
            {guides.map((guide) => (
              <a key={guide.id} href={`/learn/${guide.slug}`} className="block bg-card border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{guide.topic}</div>
                    <div className="text-xs text-muted-foreground">
                      v{guide.version} · {guide.sourceCount} source{guide.sourceCount !== 1 ? "s" : ""} · Updated {new Date(guide.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${
                      guide.completionStatus === "completed" ? "text-green-500" :
                      guide.completionStatus === "in_progress" ? "text-amber-500" : "text-muted-foreground"
                    }`}>
                      {guide.completionStatus === "completed" ? "Completed" :
                       guide.completionStatus === "in_progress" ? "In Progress" : "Not Started"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create guide viewer page**

```typescript
// src/app/learn/[slug]/page.tsx
"use client";

import { useEffect, useState, useCallback, use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GuideRenderer } from "@/components/learn/guide-renderer";
import { RefinePanel } from "@/components/learn/refine-panel";
import { ArrowLeft } from "lucide-react";
import type { GuideContent } from "@/lib/claude/skills/guide-generator";

interface GuideData {
  id: string;
  topic: string;
  slug: string;
  content: GuideContent;
  version: number;
  status: string;
  completionStatus: string;
  sectionProgress: Record<string, { quizzesCompleted: number[]; scenariosRevealed: number[] }>;
  sources: Array<{ id: string; type: string; url: string | null; title: string | null; createdAt: string }>;
  versions: Array<{ id: string; version: number; changeDescription: string | null; createdAt: string }>;
}

export default function GuideViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGuide = useCallback(async () => {
    try {
      // First get the guide ID from slug by listing all guides
      const listRes = await fetch("/api/learn/guides");
      if (!listRes.ok) { setError("Failed to load guides"); return; }
      const guides = await listRes.json();
      const match = guides.find((g: { slug: string }) => g.slug === slug);
      if (!match) { setError("Guide not found"); return; }

      const res = await fetch(`/api/learn/guides/${match.id}`);
      if (!res.ok) { setError("Failed to load guide"); return; }
      setGuide(await res.json());
    } catch {
      setError("Failed to load guide");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchGuide(); }, [fetchGuide]);

  const handleProgressUpdate = useCallback(async (progress: Record<string, { quizzesCompleted: number[]; scenariosRevealed: number[] }>) => {
    if (!guide) return;

    // Determine completion status
    const sections = guide.content.sections;
    let allComplete = true;
    let anyStarted = false;

    for (const section of sections) {
      const p = progress[section.id];
      const totalQuizzes = section.knowledgeChecks.filter((k) => k.type === "quiz").length;
      const totalScenarios = section.interviewScenarios.length;
      if (totalQuizzes + totalScenarios === 0) continue;
      if (p) {
        if (p.quizzesCompleted.length > 0 || p.scenariosRevealed.length > 0) anyStarted = true;
        if (p.quizzesCompleted.length < totalQuizzes || p.scenariosRevealed.length < totalScenarios) allComplete = false;
      } else {
        allComplete = false;
      }
    }

    const completionStatus = allComplete ? "completed" : anyStarted ? "in_progress" : "not_started";

    await fetch(`/api/learn/guides/${guide.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionProgress: progress, completionStatus }),
    });
  }, [guide]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground">{error || "Guide not found"}</p>
        <a href="/learn" className="text-primary text-sm hover:underline mt-2 inline-block">Back to Learn</a>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <a href="/learn" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Learn
        </a>
        <div className="text-xs text-muted-foreground">v{guide.version}</div>
      </div>

      {/* Guide content */}
      <GuideRenderer
        guideId={guide.id}
        content={guide.content}
        initialProgress={guide.sectionProgress}
        onProgressUpdate={handleProgressUpdate}
      />

      {/* Refine panel */}
      <div className="mt-12">
        <RefinePanel
          guideId={guide.id}
          existingSources={guide.sources}
          onRefined={() => fetchGuide()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add Learn tab to navigation**

In `src/components/nav-links.tsx`, add the `BookOpen` import and the Learn nav entry:

Add `BookOpen` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  User,
  Briefcase,
  Sparkles,
  History,
  Trophy,
  BookOpen,
} from "lucide-react";
```

Add the Learn entry to `navLinks` array after "Top Matches":

```typescript
const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/top-matches", label: "Top Matches", icon: Trophy },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/versions", label: "Versions", icon: History },
];
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

Open browser to http://localhost:3000:
1. Verify "Learn" tab appears in the navigation between "Top Matches" and "Versions"
2. Click Learn tab — should show the empty state with create input and recommendation section
3. Type a topic like "B-trees" and click Generate — should navigate to the guide viewer after generation completes
4. Verify the guide renders with sections, code examples, quizzes, and interview scenarios
5. Answer a quiz — verify it shows correct/incorrect and explanation
6. Check the Sources & Refinement panel at the bottom

- [ ] **Step 6: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/app/learn/ src/components/nav-links.tsx && git commit -m "feat(learn): add Learn tab pages and navigation"
```

---

## Task 12: Add Prism CSS Theme

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add Prism CSS import**

Add a Prism theme CSS import to `src/app/layout.tsx`. Add this import at the top of the file alongside the existing CSS import:

```typescript
import "prismjs/themes/prism-tomorrow.css";
```

This adds syntax highlighting colors for code examples in the Learn tab guides.

- [ ] **Step 2: Verify styles load**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build 2>&1 | tail -5
```

Expected: Build succeeds. Navigate to a guide in the browser and verify code blocks have syntax highlighting.

- [ ] **Step 3: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork/resumeforge && git add src/app/layout.tsx && git commit -m "feat(learn): add Prism syntax highlighting theme"
```

---

## Task 13: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md` (at repo root `/Users/abhishek/Workspaces/cowork/CLAUDE.md`)

- [ ] **Step 1: Add Learn tab documentation**

Add these entries to CLAUDE.md to document the new features:

In the **AI Layer skills** section, add:
```
  - `guide-generator.ts` — Generates or refines structured interactive study guides (generate + refine modes)
  - `guide-recommender.ts` — Suggests study topics based on skill gap analysis
```

In the **API Routes** section, add:
```
- `learn/guides/` — Guide CRUD and listing with filters
- `learn/guides/[id]/refine/` — Add sources and AI-refine existing guide
- `learn/guides/[id]/evaluate/` — AI-evaluate open-ended answer against rubric
- `learn/paths/` — Learning path CRUD
- `learn/paths/[id]/` — Single learning path management
- `learn/recommendations/` — AI-suggested study topics from gap analysis
```

In the **Data Model** section, add:
```
- `LearningPath` → has many `Guide`; stores ordered guide sequence, linked to Profile
- `Guide` → has many `GuideVersion`, `GuideSource`; structured JSON content with sections, quizzes, code examples, interview scenarios; completion tracking via `sectionProgress`
- `GuideVersion` — Version history snapshots for guide content
- `GuideSource` — Ingested sources (url, pdf, text, substack, medium) with extracted content
```

In the **Navigation**, add "Learn" between "Top Matches" and "Versions".

In the **Workflow** section, add a new step:
```
11. Use the Learn tab to generate AI study guides on technical topics, refine with additional sources, follow learning paths, and prepare for interviews with interactive quizzes and scenarios
```

- [ ] **Step 2: Commit**

```bash
cd /Users/abhishek/Workspaces/cowork && git add CLAUDE.md && git commit -m "docs: update CLAUDE.md with analytics and Learn tab documentation"
```
