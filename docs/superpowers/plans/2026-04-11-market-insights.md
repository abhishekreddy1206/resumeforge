# Market Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/insights` page that analyzes jobs scoring 60+ to surface demand patterns, skill gaps, role clusters, and high-ROI study topics, replacing the dashboard's "Profile Versions & Resume History" section with a summary card.

**Architecture:** Hybrid SQL aggregation + cached AI clustering. New API route computes demand/gap data from existing `matchResult` breakdowns and `terminologyMap` fields. AI called only for semantic job clustering (cached with fingerprint pattern from `learn-cache.ts`). Learn tab's recommendation pipeline enhanced to filter to 60+ jobs.

**Tech Stack:** Next.js App Router, Prisma/SQLite, Recharts, @base-ui/react Tabs, Claude via `askJson`

---

### Task 1: Prisma Schema — Add Insights Cache Fields

**Files:**
- Modify: `prisma/schema.prisma:42-48`

- [ ] **Step 1: Add cache fields to Profile model**

In `prisma/schema.prisma`, after line 48 (the existing `recsCacheFingerprint` field), add:

```prisma
  // Insights cache
  cachedInsights           String?
  cachedInsightsAt         DateTime?
  insightsCacheFingerprint String?
```

- [ ] **Step 2: Run migration**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npx prisma migrate dev --name add-insights-cache`

Expected: Migration created and applied successfully.

- [ ] **Step 3: Regenerate Prisma client**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npx prisma generate`

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(insights): add insights cache fields to Profile schema"
```

---

### Task 2: AI Skill — Job Clusterer

**Files:**
- Create: `src/lib/claude/skills/job-clusterer.ts`
- Modify: `src/lib/claude/index.ts:46`

- [ ] **Step 1: Create the job-clusterer skill**

Create `src/lib/claude/skills/job-clusterer.ts`:

```typescript
import { askJson } from "../client";

export interface JobCluster {
  name: string;
  description: string;
  jobIds: string[];
}

export interface ClusterResult {
  clusters: JobCluster[];
  summary: string;
}

/**
 * Skill: Job Clusterer
 *
 * Groups jobs into 2-5 semantic role profiles based on title,
 * skills, and requirements similarity. Groups by function/role type,
 * not by company or industry.
 */
export async function clusterJobs(
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    skills: string[];
    seniority?: string;
  }>,
  options?: { model?: string }
): Promise<ClusterResult> {
  const trimmed = jobs.slice(0, 30).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    skills: j.skills.slice(0, 12),
    seniority: j.seniority,
  }));

  return askJson(
    `You are a career strategist. Group these job postings into 2-5 role profiles based on the type of work, required skills, and function — NOT by company or industry.

JOBS (${trimmed.length}):
${JSON.stringify(trimmed)}

RULES:
- Each job must belong to exactly one cluster
- Cluster names should be short, descriptive role-type labels (e.g., "Backend Infrastructure", "Platform Engineering", "Full-Stack Product")
- Each cluster gets a one-sentence description of what unifies the jobs in it
- If all jobs are very similar, 2 clusters is fine. Only use more if there are genuinely distinct role types.
- Return every job ID in exactly one cluster

Return ONLY valid JSON:
{
  "clusters": [
    {"name": "Backend Infrastructure", "description": "Server-side systems roles focused on distributed services, APIs, and cloud infrastructure.", "jobIds": ["id1", "id2"]}
  ],
  "summary": "Your targets split into 2 profiles. Backend Infrastructure dominates (60%) with K8s/AWS as the common thread. Platform Engineering has fewer roles but higher average fit."
}`,
    { skill: "job-clusterer", model: options?.model }
  );
}
```

- [ ] **Step 2: Export from index**

In `src/lib/claude/index.ts`, after line 46 (`export type { PathMatchResult }...`), add:

```typescript
export { clusterJobs } from "./skills/job-clusterer";
export type { JobCluster, ClusterResult } from "./skills/job-clusterer";
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude/skills/job-clusterer.ts src/lib/claude/index.ts
git commit -m "feat(insights): add job-clusterer AI skill"
```

---

### Task 3: Insights API Route

**Files:**
- Create: `src/app/api/insights/route.ts`

This is the largest task. The route computes all insights data: SQL aggregations for demand/gaps, AI clustering (cached), and learn topics derivation.

- [ ] **Step 1: Create the insights API route**

Create `src/app/api/insights/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clusterJobs } from "@/lib/claude";
import type { ClusterResult } from "@/lib/claude/skills/job-clusterer";

const SCORE_THRESHOLD = 60;

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function computeInsightsFingerprint(
  jobs: Array<{ id: string; matchedAt: Date | null }>
): string {
  const sorted = [...jobs].sort((a, b) => a.id.localeCompare(b.id));
  return hashString(
    JSON.stringify(sorted.map((j) => [j.id, j.matchedAt?.toISOString()]))
  );
}

interface MatchBreakdown {
  score?: number;
  overallScore?: number;
  breakdown?: {
    gaps?: string[];
    bridgeableSkills?: Array<{ jobRequirement: string; yourSkill: string }>;
    directMatches?: string[];
  };
}

interface RealisticJob {
  id: string;
  title: string;
  company: string;
  score: number;
  matchedAt: Date | null;
  skills: string[];
  seniority: string | null;
  gaps: string[];
  bridges: Array<{ jobRequirement: string; yourSkill: string }>;
  directMatches: string[];
  terminologyMap: Array<{ jdTerm: string; resumeSynonyms: string[] }>;
}

export async function GET() {
  const [profile, allJobs, profileSkills, existingGuides] = await Promise.all([
    prisma.profile.findFirst({
      select: {
        id: true,
        cachedInsights: true,
        cachedInsightsAt: true,
        insightsCacheFingerprint: true,
      },
    }),
    prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: {
        id: true,
        title: true,
        company: true,
        skills: true,
        seniority: true,
        matchResult: true,
        matchedAt: true,
        terminologyMap: true,
      },
    }),
    prisma.skill.findMany({ select: { name: true } }),
    prisma.guide.findMany({ select: { topic: true } }),
  ]);

  if (!profile) {
    return NextResponse.json({ error: "No profile" }, { status: 404 });
  }

  // Parse matchResult and filter to realistic targets (score >= 60)
  const realisticJobs: RealisticJob[] = [];
  for (const job of allJobs) {
    const mr = safeJsonParse(job.matchResult) as MatchBreakdown | null;
    if (!mr) continue;
    const score = mr.score ?? mr.overallScore ?? 0;
    if (score < SCORE_THRESHOLD) continue;
    realisticJobs.push({
      id: job.id,
      title: job.title,
      company: job.company,
      score,
      matchedAt: job.matchedAt,
      skills: (safeJsonParse(job.skills, []) as string[]) || [],
      seniority: job.seniority,
      gaps: mr.breakdown?.gaps || [],
      bridges: (mr.breakdown?.bridgeableSkills || []).map((b) => ({
        jobRequirement: b.jobRequirement,
        yourSkill: b.yourSkill,
      })),
      directMatches: mr.breakdown?.directMatches || [],
      terminologyMap:
        (safeJsonParse(job.terminologyMap, []) as Array<{
          jdTerm: string;
          resumeSynonyms: string[];
        }>) || [],
    });
  }

  const totalJobs = allJobs.length;

  if (realisticJobs.length < 2) {
    return NextResponse.json({
      meta: {
        totalJobs,
        realisticJobs: realisticJobs.length,
        threshold: SCORE_THRESHOLD,
        avgScore: 0,
        clusterCount: 0,
        gapCount: 0,
        topFinding: null,
        cachedAt: null,
      },
      clusters: [],
      clusterSummary: "",
      demandPatterns: [],
      gapAnalysis: { gaps: [], bridges: [], strengths: [] },
      learnTopics: [],
    });
  }

  // Check cache
  const fingerprint = computeInsightsFingerprint(
    realisticJobs.map((j) => ({ id: j.id, matchedAt: j.matchedAt }))
  );

  if (profile.insightsCacheFingerprint === fingerprint && profile.cachedInsights) {
    return NextResponse.json(JSON.parse(profile.cachedInsights));
  }

  // --- SQL path: demand patterns + gap analysis ---

  const profileSkillNames = new Set(profileSkills.map((s) => s.name.toLowerCase()));

  // Build synonym map from all terminologyMaps
  const synonymToCanonical = new Map<string, string>();
  for (const job of realisticJobs) {
    for (const entry of job.terminologyMap) {
      for (const syn of entry.resumeSynonyms) {
        synonymToCanonical.set(syn.toLowerCase(), entry.jdTerm.toLowerCase());
      }
    }
  }

  // Aggregate skill demand across realistic jobs
  const skillData = new Map<
    string,
    { frequency: number; jobIds: Set<string>; synonyms: Set<string> }
  >();

  for (const job of realisticJobs) {
    const seen = new Set<string>();
    for (const skill of job.skills) {
      const key = skill.toLowerCase();
      // Check if this is a synonym of an already-tracked canonical
      const canonical = synonymToCanonical.get(key);
      const normalizedKey = canonical || key;
      if (seen.has(normalizedKey)) continue;
      seen.add(normalizedKey);
      const entry = skillData.get(normalizedKey) || {
        frequency: 0,
        jobIds: new Set(),
        synonyms: new Set(),
      };
      entry.frequency++;
      entry.jobIds.add(job.id);
      if (canonical && canonical !== key) entry.synonyms.add(skill);
      skillData.set(normalizedKey, entry);
    }
  }

  // Classify each skill as gap/bridgeable/strong
  const demandPatterns = Array.from(skillData.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([skill, data]) => {
      let status: "gap" | "bridgeable" | "strong" = "gap";
      if (profileSkillNames.has(skill)) {
        status = "strong";
      } else {
        const canonical = synonymToCanonical.get(skill);
        if (canonical && profileSkillNames.has(canonical)) {
          status = "strong";
        } else {
          for (const pSkill of profileSkillNames) {
            if (synonymToCanonical.get(pSkill) === skill) {
              status = "bridgeable";
              break;
            }
          }
        }
      }
      return {
        skill,
        frequency: data.frequency,
        totalJobs: realisticJobs.length,
        status,
        clusters: [] as string[], // populated after clustering
        synonyms: data.synonyms.size > 0 ? Array.from(data.synonyms) : undefined,
      };
    });

  // Gap analysis from matchResult breakdowns
  const gapFreq = new Map<string, { frequency: number; jobIds: Set<string>; bridgeableBy?: { yourSkill: string; count: number } }>();
  const bridgeFreq = new Map<string, { yourSkill: string; frequency: number }>();
  const strengthFreq = new Map<string, { frequency: number; jobIds: Set<string> }>();

  for (const job of realisticJobs) {
    for (const gap of job.gaps) {
      const key = gap.toLowerCase();
      const entry = gapFreq.get(key) || { frequency: 0, jobIds: new Set() };
      entry.frequency++;
      entry.jobIds.add(job.id);
      gapFreq.set(key, entry);
    }
    for (const bridge of job.bridges) {
      const key = bridge.jobRequirement.toLowerCase();
      // Track as bridgeable gap
      const gapEntry = gapFreq.get(key) || { frequency: 0, jobIds: new Set() };
      // Also track bridge mapping
      const bEntry = bridgeFreq.get(key) || {
        yourSkill: bridge.yourSkill,
        frequency: 0,
      };
      bEntry.frequency++;
      bridgeFreq.set(key, bEntry);
      // If it's in gapFreq, annotate the bridge
      if (gapEntry.frequency > 0) {
        gapEntry.bridgeableBy = {
          yourSkill: bridge.yourSkill,
          count: (gapEntry.bridgeableBy?.count || 0) + 1,
        };
        gapFreq.set(key, gapEntry);
      }
    }
    for (const dm of job.directMatches) {
      const key = dm.toLowerCase();
      const entry = strengthFreq.get(key) || { frequency: 0, jobIds: new Set() };
      entry.frequency++;
      entry.jobIds.add(job.id);
      strengthFreq.set(key, entry);
    }
  }

  const gaps = Array.from(gapFreq.entries())
    .filter(([key]) => !bridgeFreq.has(key)) // pure gaps only
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([skill, data]) => ({
      skill,
      frequency: data.frequency,
      clusters: [] as string[], // populated after clustering
      bridgeableBy: data.bridgeableBy
        ? { yourSkill: data.bridgeableBy.yourSkill, coverageCount: data.bridgeableBy.count }
        : undefined,
    }));

  const bridges = Array.from(bridgeFreq.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([req, data]) => ({
      jobRequirement: req,
      yourSkill: data.yourSkill,
      frequency: data.frequency,
      note: "terminology gap, not knowledge gap",
    }));

  const strengths = Array.from(strengthFreq.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 15)
    .map(([skill, data]) => ({
      skill,
      frequency: data.frequency,
      clusters: [] as string[], // populated after clustering
    }));

  // --- AI path: job clustering ---

  let clusterResult: ClusterResult;
  if (realisticJobs.length < 3) {
    // Too few jobs for meaningful clustering — single cluster
    clusterResult = {
      clusters: [
        {
          name: "All Targets",
          description: "All your realistic job targets.",
          jobIds: realisticJobs.map((j) => j.id),
        },
      ],
      summary: `You have ${realisticJobs.length} realistic targets. Add more scored jobs to enable AI clustering.`,
    };
  } else {
    clusterResult = await clusterJobs(
      realisticJobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        skills: j.skills,
        seniority: j.seniority || undefined,
      }))
    );
  }

  // Enrich clusters with computed data
  const jobToCluster = new Map<string, string>();
  const clusters = clusterResult.clusters.map((c) => {
    const clusterJobs = realisticJobs.filter((j) => c.jobIds.includes(j.id));
    for (const j of clusterJobs) jobToCluster.set(j.id, c.name);

    // Compute top skills for this cluster
    const clusterSkillFreq = new Map<string, number>();
    for (const j of clusterJobs) {
      for (const s of j.skills) {
        const key = s.toLowerCase();
        clusterSkillFreq.set(key, (clusterSkillFreq.get(key) || 0) + 1);
      }
    }
    const topSkills = Array.from(clusterSkillFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s]) => s);

    return {
      name: c.name,
      description: c.description,
      jobIds: c.jobIds,
      jobs: clusterJobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        score: j.score,
      })),
      topSkills,
      avgScore: clusterJobs.length > 0
        ? Math.round(clusterJobs.reduce((sum, j) => sum + j.score, 0) / clusterJobs.length)
        : 0,
    };
  });

  // Annotate demand patterns and gaps with cluster names
  for (const dp of demandPatterns) {
    const sd = skillData.get(dp.skill);
    if (sd) {
      const clusterNames = new Set<string>();
      for (const jid of sd.jobIds) {
        const cn = jobToCluster.get(jid);
        if (cn) clusterNames.add(cn);
      }
      dp.clusters = Array.from(clusterNames);
    }
  }

  for (const g of gaps) {
    const gd = gapFreq.get(g.skill);
    if (gd) {
      const clusterNames = new Set<string>();
      for (const jid of gd.jobIds) {
        const cn = jobToCluster.get(jid);
        if (cn) clusterNames.add(cn);
      }
      g.clusters = Array.from(clusterNames);
    }
  }

  for (const s of strengths) {
    const sd = strengthFreq.get(s.skill);
    if (sd) {
      const clusterNames = new Set<string>();
      for (const jid of sd.jobIds) {
        const cn = jobToCluster.get(jid);
        if (cn) clusterNames.add(cn);
      }
      s.clusters = Array.from(clusterNames);
    }
  }

  // --- Derive learn topics from gaps ---

  const guideTopicSet = new Set(existingGuides.map((g) => g.topic.toLowerCase()));

  const learnTopics = gaps
    .filter((g) => !guideTopicSet.has(g.skill))
    .slice(0, 8)
    .map((g, i) => ({
      rank: i + 1,
      topic: g.skill.charAt(0).toUpperCase() + g.skill.slice(1),
      description: `Addresses a gap found in ${g.frequency} of your ${realisticJobs.length} realistic targets${g.clusters.length > 0 ? ` across ${g.clusters.join(", ")}` : ""}.`,
      difficulty: (g.frequency >= 5 ? "intermediate" : g.frequency >= 3 ? "intermediate" : "beginner") as
        | "beginner"
        | "intermediate"
        | "advanced",
      gapSkills: [{ skill: g.skill, frequency: g.frequency }],
      clusters: g.clusters,
      existingGuide: false,
    }));

  // --- Compute meta ---

  const avgScore = Math.round(
    realisticJobs.reduce((sum, j) => sum + j.score, 0) / realisticJobs.length
  );

  const topGap = gaps[0];
  const topFinding = topGap
    ? `${topGap.skill.charAt(0).toUpperCase() + topGap.skill.slice(1)} appears in ${topGap.frequency}/${realisticJobs.length} of your realistic targets.${topGap.clusters.length > 1 ? ` Studying it would impact ${topGap.clusters.length} role clusters.` : ""}`
    : "You're well-matched across your realistic targets.";

  const response = {
    meta: {
      totalJobs,
      realisticJobs: realisticJobs.length,
      threshold: SCORE_THRESHOLD,
      avgScore,
      clusterCount: clusters.length,
      gapCount: gaps.length,
      topFinding,
      cachedAt: new Date().toISOString(),
    },
    clusters,
    clusterSummary: clusterResult.summary,
    demandPatterns,
    gapAnalysis: { gaps, bridges, strengths },
    learnTopics,
  };

  // Cache
  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      cachedInsights: JSON.stringify(response),
      cachedInsightsAt: new Date(),
      insightsCacheFingerprint: fingerprint,
    },
  });

  return NextResponse.json(response);
}
```

- [ ] **Step 2: Verify the API builds**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors related to `insights/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/insights/route.ts
git commit -m "feat(insights): add /api/insights route with hybrid SQL+AI computation"
```

---

### Task 4: Learn Integration — Filter to 60+ Jobs

**Files:**
- Modify: `src/lib/learn-cache.ts:117-122`

- [ ] **Step 1: Add score filtering to refreshRecommendationsCache**

In `src/lib/learn-cache.ts`, replace lines 117-122:

```typescript
  const jobs = await prisma.job.findMany({
    where: { matchResult: { not: null } },
    select: { id: true, title: true, company: true, matchResult: true, matchedAt: true, terminologyMap: true },
  });

  if (jobs.length < 2) return [];
```

With:

```typescript
  const allMatchedJobs = await prisma.job.findMany({
    where: { matchResult: { not: null } },
    select: { id: true, title: true, company: true, matchResult: true, matchedAt: true, terminologyMap: true },
  });

  // Filter to realistic targets (score >= 60) for more targeted recommendations
  const SCORE_THRESHOLD = 60;
  const jobs = allMatchedJobs.filter((job) => {
    try {
      const mr = JSON.parse(job.matchResult as string);
      const score = mr?.score ?? mr?.overallScore ?? 0;
      return score >= SCORE_THRESHOLD;
    } catch {
      return false;
    }
  });

  if (jobs.length < 2) return [];
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/learn-cache.ts
git commit -m "feat(insights): filter Learn recommendations to 60+ scoring jobs"
```

---

### Task 5: Navigation — Add Insights Link

**Files:**
- Modify: `src/components/nav-links.tsx:4-22`

- [ ] **Step 1: Add the Insights nav link**

In `src/components/nav-links.tsx`, add `BarChart3` to the lucide import (line 4-12):

Replace:
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

With:
```typescript
import {
  LayoutDashboard,
  User,
  Briefcase,
  Sparkles,
  History,
  Trophy,
  BookOpen,
  BarChart3,
} from "lucide-react";
```

Then add the insights entry to the `navLinks` array (after line 20, before the versions entry):

Replace:
```typescript
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/versions", label: "Versions", icon: History },
```

With:
```typescript
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/versions", label: "Versions", icon: History },
```

- [ ] **Step 2: Commit**

```bash
git add src/components/nav-links.tsx
git commit -m "feat(insights): add Insights link to navigation"
```

---

### Task 6: Insights Page — Shell with Tabs and Data Fetching

**Files:**
- Create: `src/app/insights/page.tsx`

- [ ] **Step 1: Create the insights page with tabs and data fetching**

Create `src/app/insights/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Layers, TrendingUp, BookOpen, AlertCircle } from "lucide-react";
import { ClustersTab } from "./clusters-tab";
import { DemandTab } from "./demand-tab";
import { GapsTab } from "./gaps-tab";
import { StudyTab } from "./study-tab";

interface InsightsData {
  meta: {
    totalJobs: number;
    realisticJobs: number;
    threshold: number;
    avgScore: number;
    clusterCount: number;
    gapCount: number;
    topFinding: string | null;
    cachedAt: string | null;
  };
  clusters: Array<{
    name: string;
    description: string;
    jobIds: string[];
    jobs: Array<{ id: string; title: string; company: string; score: number }>;
    topSkills: string[];
    avgScore: number;
  }>;
  clusterSummary: string;
  demandPatterns: Array<{
    skill: string;
    frequency: number;
    totalJobs: number;
    status: "gap" | "bridgeable" | "strong";
    clusters: string[];
    synonyms?: string[];
  }>;
  gapAnalysis: {
    gaps: Array<{
      skill: string;
      frequency: number;
      clusters: string[];
      bridgeableBy?: { yourSkill: string; coverageCount: number };
    }>;
    bridges: Array<{
      jobRequirement: string;
      yourSkill: string;
      frequency: number;
      note: string;
    }>;
    strengths: Array<{
      skill: string;
      frequency: number;
      clusters: string[];
    }>;
  };
  learnTopics: Array<{
    rank: number;
    topic: string;
    description: string;
    difficulty: "beginner" | "intermediate" | "advanced";
    gapSkills: Array<{ skill: string; frequency: number }>;
    clusters: string[];
    existingGuide: boolean;
  }>;
}

export { type InsightsData };

const CLUSTER_COLORS = [
  { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400", badge: "bg-indigo-500/20" },
  { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", badge: "bg-blue-500/20" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", badge: "bg-emerald-500/20" },
  { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", badge: "bg-amber-500/20" },
  { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", badge: "bg-rose-500/20" },
];

export { CLUSTER_COLORS };

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data || data.meta.realisticJobs < 2) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-semibold mb-2">Market Insights</h1>
        <div className="bg-card border rounded-lg p-8 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            Score more jobs to unlock market insights. You need at least 2 jobs matching 60%+ to see patterns.
          </p>
          <a href="/jobs" className="text-primary text-sm hover:underline">
            Go to Jobs →
          </a>
        </div>
      </div>
    );
  }

  const { meta } = data;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">Market Insights</h1>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-3">
          <div className="text-2xl font-bold">{meta.realisticJobs}</div>
          <div className="text-xs text-muted-foreground">realistic targets</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-2xl font-bold">{meta.clusterCount}</div>
          <div className="text-xs text-muted-foreground">role profiles</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-2xl font-bold text-red-400">{meta.gapCount}</div>
          <div className="text-xs text-muted-foreground">key gaps</div>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <div className="text-2xl font-bold text-emerald-400">{meta.avgScore}%</div>
          <div className="text-xs text-muted-foreground">avg match</div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="clusters">
        <TabsList variant="line">
          <TabsTrigger value="clusters">
            <Layers className="w-3.5 h-3.5" /> Clusters
          </TabsTrigger>
          <TabsTrigger value="demand">
            <BarChart3 className="w-3.5 h-3.5" /> Demand
          </TabsTrigger>
          <TabsTrigger value="gaps">
            <TrendingUp className="w-3.5 h-3.5" /> Gaps
          </TabsTrigger>
          <TabsTrigger value="study">
            <BookOpen className="w-3.5 h-3.5" /> Study
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clusters">
          <ClustersTab clusters={data.clusters} summary={data.clusterSummary} />
        </TabsContent>
        <TabsContent value="demand">
          <DemandTab patterns={data.demandPatterns} clusters={data.clusters} />
        </TabsContent>
        <TabsContent value="gaps">
          <GapsTab analysis={data.gapAnalysis} clusters={data.clusters} />
        </TabsContent>
        <TabsContent value="study">
          <StudyTab topics={data.learnTopics} realisticJobCount={meta.realisticJobs} clusters={data.clusters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles (tab components don't exist yet — skip for now)**

This will have import errors until tab components are created in subsequent tasks. That's expected.

- [ ] **Step 3: Commit**

```bash
git add src/app/insights/page.tsx
git commit -m "feat(insights): create insights page shell with tabs and data fetching"
```

---

### Task 7: Clusters Tab Component

**Files:**
- Create: `src/app/insights/clusters-tab.tsx`

- [ ] **Step 1: Create the clusters tab**

Create `src/app/insights/clusters-tab.tsx`:

```typescript
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CLUSTER_COLORS } from "./page";

interface Cluster {
  name: string;
  description: string;
  jobIds: string[];
  jobs: Array<{ id: string; title: string; company: string; score: number }>;
  topSkills: string[];
  avgScore: number;
}

export function ClustersTab({
  clusters,
  summary,
}: {
  clusters: Cluster[];
  summary: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4 pt-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.map((cluster, i) => {
          const colors = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
          const isOpen = expanded === cluster.name;

          return (
            <div
              key={cluster.name}
              className={`border rounded-lg p-4 ${colors.border} ${colors.bg}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{cluster.name}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${colors.badge} ${colors.text}`}
                >
                  {cluster.jobs.length} jobs
                </span>
              </div>

              <div className="text-xs text-muted-foreground mb-3">
                Avg score: {cluster.avgScore}%
              </div>

              <div className="flex flex-wrap gap-1 mb-3">
                {cluster.topSkills.map((skill) => (
                  <span
                    key={skill}
                    className="text-[10px] bg-foreground/5 px-1.5 py-0.5 rounded"
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <button
                onClick={() => setExpanded(isOpen ? null : cluster.name)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {isOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {isOpen ? "Hide" : "Show"} {cluster.jobs.length} jobs
              </button>

              {isOpen && (
                <div className="mt-3 space-y-1.5 border-t pt-3 border-foreground/5">
                  {cluster.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-medium">{job.title}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {job.company}
                        </span>
                      </div>
                      <span className="font-mono text-xs">{job.score}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {summary && (
        <div className="border-l-3 border-primary/40 bg-foreground/[0.02] rounded-r-lg px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          {summary}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/insights/clusters-tab.tsx
git commit -m "feat(insights): add Clusters tab component"
```

---

### Task 8: Demand Tab Component

**Files:**
- Create: `src/app/insights/demand-tab.tsx`

- [ ] **Step 1: Create the demand tab**

Create `src/app/insights/demand-tab.tsx`:

```typescript
"use client";

import { useState } from "react";
import { CLUSTER_COLORS } from "./page";

type Status = "gap" | "bridgeable" | "strong";

interface DemandPattern {
  skill: string;
  frequency: number;
  totalJobs: number;
  status: Status;
  clusters: string[];
  synonyms?: string[];
}

interface Cluster {
  name: string;
}

const STATUS_COLORS: Record<Status, { bar: string; text: string; label: string }> = {
  gap: { bar: "bg-red-500/25", text: "text-red-400", label: "gap" },
  bridgeable: { bar: "bg-amber-500/25", text: "text-amber-400", label: "bridgeable" },
  strong: { bar: "bg-emerald-500/25", text: "text-emerald-400", label: "strong" },
};

const FILTERS: Array<{ value: Status | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "gap", label: "Gaps only" },
  { value: "bridgeable", label: "Bridgeable" },
  { value: "strong", label: "Strong" },
];

export function DemandTab({
  patterns,
  clusters,
}: {
  patterns: DemandPattern[];
  clusters: Cluster[];
}) {
  const [filter, setFilter] = useState<Status | "all">("all");

  const clusterIndex = new Map(clusters.map((c, i) => [c.name, i]));
  const filtered =
    filter === "all" ? patterns : patterns.filter((p) => p.status === filter);
  const maxFreq = Math.max(...patterns.map((p) => p.frequency), 1);

  return (
    <div className="space-y-4 pt-4">
      {/* Filter pills */}
      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              filter === f.value
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Bars */}
      <div className="space-y-1.5">
        {filtered.map((p) => {
          const sc = STATUS_COLORS[p.status];
          const widthPct = Math.max((p.frequency / maxFreq) * 100, 8);

          return (
            <div key={p.skill} className="flex items-center gap-2">
              <span
                className="w-28 text-right text-xs truncate shrink-0"
                title={
                  p.synonyms
                    ? `Also: ${p.synonyms.join(", ")}`
                    : undefined
                }
              >
                {p.skill}
              </span>

              <div className="flex-1 relative">
                <div
                  className={`h-5 rounded ${sc.bar} flex items-center px-2`}
                  style={{ width: `${widthPct}%` }}
                >
                  <span className={`text-[10px] ${sc.text}`}>{sc.label}</span>
                </div>
              </div>

              <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                {p.frequency}/{p.totalJobs} jobs
              </span>

              <div className="flex gap-0.5 shrink-0">
                {p.clusters.map((cn) => {
                  const idx = clusterIndex.get(cn) ?? 0;
                  const colors = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
                  // 2-letter abbreviation
                  const abbr = cn
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <span
                      key={cn}
                      title={cn}
                      className={`text-[9px] px-1 py-0.5 rounded ${colors.badge} ${colors.text}`}
                    >
                      {abbr}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No skills match this filter.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/insights/demand-tab.tsx
git commit -m "feat(insights): add Demand tab component with filter pills and bars"
```

---

### Task 9: Gaps Tab Component

**Files:**
- Create: `src/app/insights/gaps-tab.tsx`

- [ ] **Step 1: Create the gaps tab**

Create `src/app/insights/gaps-tab.tsx`:

```typescript
"use client";

import { CLUSTER_COLORS } from "./page";

interface GapAnalysis {
  gaps: Array<{
    skill: string;
    frequency: number;
    clusters: string[];
    bridgeableBy?: { yourSkill: string; coverageCount: number };
  }>;
  bridges: Array<{
    jobRequirement: string;
    yourSkill: string;
    frequency: number;
    note: string;
  }>;
  strengths: Array<{
    skill: string;
    frequency: number;
    clusters: string[];
  }>;
}

interface Cluster {
  name: string;
}

export function GapsTab({
  analysis,
  clusters,
}: {
  analysis: GapAnalysis;
  clusters: Cluster[];
}) {
  const clusterIndex = new Map(clusters.map((c, i) => [c.name, i]));

  return (
    <div className="space-y-4 pt-4">
      {/* Summary counts */}
      <div className="flex gap-5 text-sm">
        <div>
          <span className="text-xl font-bold text-red-400">
            {analysis.gaps.length}
          </span>{" "}
          <span className="text-muted-foreground">pure gaps</span>
        </div>
        <div>
          <span className="text-xl font-bold text-amber-400">
            {analysis.bridges.length}
          </span>{" "}
          <span className="text-muted-foreground">bridgeable</span>
        </div>
        <div>
          <span className="text-xl font-bold text-emerald-400">
            {analysis.strengths.length}
          </span>{" "}
          <span className="text-muted-foreground">strong matches</span>
        </div>
      </div>

      {/* Gap cards */}
      <div className="space-y-2">
        {analysis.gaps.map((gap) => (
          <div
            key={gap.skill}
            className="border border-red-500/20 border-l-[3px] border-l-red-500/60 rounded-lg p-3 bg-red-500/[0.02]"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{gap.skill}</span>
                <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">
                  gap
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {gap.frequency} jobs · {gap.clusters.length} cluster
                {gap.clusters.length !== 1 ? "s" : ""}
              </span>
            </div>

            {gap.bridgeableBy && (
              <div className="text-xs text-muted-foreground mb-1.5">
                Bridge:{" "}
                <span className="text-amber-400">
                  {gap.bridgeableBy.yourSkill}
                </span>{" "}
                (you have) → partial coverage in {gap.bridgeableBy.coverageCount}{" "}
                jobs
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {gap.clusters.map((cn) => {
                  const idx = clusterIndex.get(cn) ?? 0;
                  const colors = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
                  return (
                    <span
                      key={cn}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${colors.badge} ${colors.text}`}
                    >
                      {cn}
                    </span>
                  );
                })}
              </div>
              <a
                href={`/learn?topic=${encodeURIComponent(gap.skill)}`}
                className="text-[10px] text-primary hover:underline"
              >
                Study this →
              </a>
            </div>
          </div>
        ))}

        {/* Bridge cards */}
        {analysis.bridges.map((bridge) => (
          <div
            key={bridge.jobRequirement}
            className="border border-amber-500/20 border-l-[3px] border-l-amber-500/60 rounded-lg p-3 bg-amber-500/[0.02]"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {bridge.jobRequirement}
                </span>
                <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">
                  bridgeable
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {bridge.frequency} jobs
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Your skill:{" "}
              <span className="text-emerald-400">{bridge.yourSkill}</span> —{" "}
              {bridge.note}
            </div>
          </div>
        ))}
      </div>

      {analysis.gaps.length === 0 && analysis.bridges.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No gaps found — you&apos;re a strong match across all realistic
          targets.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/insights/gaps-tab.tsx
git commit -m "feat(insights): add Gaps tab component with bridge context"
```

---

### Task 10: Study Tab Component

**Files:**
- Create: `src/app/insights/study-tab.tsx`

- [ ] **Step 1: Create the study tab**

Create `src/app/insights/study-tab.tsx`:

```typescript
"use client";

import { CLUSTER_COLORS } from "./page";

interface LearnTopic {
  rank: number;
  topic: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  gapSkills: Array<{ skill: string; frequency: number }>;
  clusters: string[];
  existingGuide: boolean;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-emerald-500/15 text-emerald-400",
  intermediate: "bg-amber-500/15 text-amber-400",
  advanced: "bg-red-500/15 text-red-400",
};

interface Cluster {
  name: string;
}

export function StudyTab({
  topics,
  realisticJobCount,
  clusters,
}: {
  topics: LearnTopic[];
  realisticJobCount: number;
  clusters: Cluster[];
}) {
  const clusterIndex = new Map(clusters.map((c, i) => [c.name, i]));
  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Topics ranked by ROI — studying these would improve your match across the
        most realistic targets. Based on gaps from your{" "}
        <strong className="text-foreground">{realisticJobCount} jobs</strong>{" "}
        scoring 60+.
      </p>

      <div className="space-y-3">
        {topics.map((topic) => (
          <div
            key={topic.rank}
            className="border border-primary/15 rounded-lg p-4 bg-primary/[0.02] flex gap-4"
          >
            {/* Rank */}
            <div className="text-center shrink-0 w-12">
              <div
                className="text-xl font-bold"
                style={{
                  opacity: Math.max(0.4, 1 - (topic.rank - 1) * 0.15),
                  color: "var(--color-primary)",
                }}
              >
                #{topic.rank}
              </div>
              {topic.rank === 1 && (
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  highest ROI
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold">{topic.topic}</h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded ${DIFFICULTY_COLORS[topic.difficulty]}`}
                >
                  {topic.difficulty}
                </span>
              </div>

              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                {topic.description}
              </p>

              {/* Gap tags */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {topic.gapSkills.map((gs) => (
                  <span
                    key={gs.skill}
                    className="text-[10px] text-red-400"
                  >
                    Closes gap: {gs.skill} ({gs.frequency} jobs)
                  </span>
                ))}
              </div>

              {/* Footer: clusters + action */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {topic.clusters.map((cn) => {
                    const idx = clusterIndex.get(cn) ?? 0;
                    const colors = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
                    return (
                      <span
                        key={cn}
                        className={`text-[9px] px-1.5 py-0.5 rounded ${colors.badge} ${colors.text}`}
                      >
                        {cn}
                      </span>
                    );
                  })}
                </div>
                <a
                  href={
                    topic.existingGuide
                      ? `/learn/${encodeURIComponent(topic.topic.toLowerCase().replace(/\s+/g, "-"))}`
                      : `/learn?topic=${encodeURIComponent(topic.topic)}`
                  }
                  className="text-xs bg-primary/20 border border-primary/30 text-primary px-3 py-1 rounded-md hover:bg-primary/30 transition-colors"
                >
                  {topic.existingGuide ? "View Guide →" : "Generate Guide →"}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {topics.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No study topics needed — you&apos;re a strong match across all
          realistic targets.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/insights/study-tab.tsx
git commit -m "feat(insights): add Study tab component with ROI-ranked topic cards"
```

---

### Task 11: Dashboard — Replace Versions Section with Insights Card

**Files:**
- Modify: `src/app/page.tsx:9-17` (imports)
- Modify: `src/app/page.tsx:119-138` (data fetching)
- Modify: `src/app/page.tsx:311-346` (versions section)

- [ ] **Step 1: Add insights state and fetch**

In `src/app/page.tsx`, add `TrendingUp` to the lucide import block (lines 9-17). Replace:

```typescript
import {
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  User,
  ArrowRight,
} from "lucide-react";
```

With:

```typescript
import {
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  User,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
```

- [ ] **Step 2: Add insights interface**

After the `AnalyticsData` interface (around line 84), add:

```typescript
interface InsightsMeta {
  totalJobs: number;
  realisticJobs: number;
  threshold: number;
  avgScore: number;
  clusterCount: number;
  gapCount: number;
  topFinding: string | null;
  cachedAt: string | null;
}
```

- [ ] **Step 3: Add insights state and fetch call**

In the `Dashboard` component, after line 124 (`const [aiUsageOpen, setAiUsageOpen] = useState(false);`), add:

```typescript
  const [insightsMeta, setInsightsMeta] = useState<InsightsMeta | null>(null);
```

Then update the `useEffect` fetch block (lines 126-138). Replace:

```typescript
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
```

With:

```typescript
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

    // Load insights meta in background (may be slow on cache miss)
    fetch("/api/insights")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.meta) setInsightsMeta(d.meta);
      });
  }, []);
```

- [ ] **Step 4: Replace the Profile Versions section**

Replace lines 311-346 (the `{/* Profile Versions */}` section):

```typescript
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
```

With:

```typescript
      {/* Market Insights Card */}
      {insightsMeta && insightsMeta.realisticJobs >= 2 ? (
        <a href="/insights" className="block">
          <section className="bg-card border border-primary/20 rounded-lg p-5 hover:bg-primary/[0.02] transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-semibold">Market Insights</h2>
              </div>
              <span className="text-xs text-primary">View all →</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xl font-bold">{insightsMeta.realisticJobs}</div>
                <div className="text-[10px] text-muted-foreground">realistic targets</div>
              </div>
              <div>
                <div className="text-xl font-bold">{insightsMeta.clusterCount}</div>
                <div className="text-[10px] text-muted-foreground">role profiles</div>
              </div>
              <div>
                <div className="text-xl font-bold text-red-400">{insightsMeta.gapCount}</div>
                <div className="text-[10px] text-muted-foreground">key gaps</div>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-400">{insightsMeta.avgScore}%</div>
                <div className="text-[10px] text-muted-foreground">avg match</div>
              </div>
            </div>
            {insightsMeta.topFinding && (
              <div className="border-l-[3px] border-primary/40 bg-foreground/[0.02] rounded-r px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                <strong className="text-primary">Top finding:</strong> {insightsMeta.topFinding}
              </div>
            )}
          </section>
        </a>
      ) : hasAnalytics && analytics.versions.length > 0 ? (
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
      ) : null}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(insights): replace dashboard versions section with insights card"
```

---

### Task 12: Build Verification and Manual Test

**Files:** None (verification only)

- [ ] **Step 1: Type check**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Lint**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run lint`

Expected: No errors.

- [ ] **Step 3: Build**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Start dev server and test**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run dev`

Test manually:
1. Open http://localhost:3000 — verify the dashboard shows the "Market Insights" card (or falls back to the old versions list if < 2 jobs score 60+)
2. Click through to http://localhost:3000/insights — verify all 4 tabs render
3. Check the Clusters tab shows expandable cards
4. Check the Demand tab shows bars with filter pills
5. Check the Gaps tab shows gap and bridge cards
6. Check the Study tab shows ROI-ranked topic cards with "Generate Guide" links
7. Verify navigation sidebar shows "Insights" link

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(insights): address build/lint issues"
```
