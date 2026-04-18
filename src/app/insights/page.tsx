"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Layers, TrendingUp, BookOpen, AlertCircle, RefreshCw } from "lucide-react";
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
      matchedGuide: { id: string; slug: string; topic: string } | null;
      coveredByGuide: boolean;
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
    matchedGuide: { id: string; slug: string; topic: string } | null;
    coveredByGuide: boolean;
  }>;
  revalidating?: boolean;
}

export { type InsightsData };

const CLUSTER_COLORS = [
  { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400", badge: "bg-indigo-500/20" },
  { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", badge: "bg-blue-500/20" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", badge: "bg-emerald-500/20" },
  { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", badge: "bg-amber-500/20" },
  { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", badge: "bg-rose-500/20" },
];

const OTHER_CLUSTER_COLOR = {
  bg: "bg-muted/30",
  border: "border-dashed border-foreground/20",
  text: "text-muted-foreground",
  badge: "bg-foreground/10",
};

export { CLUSTER_COLORS, OTHER_CLUSTER_COLOR };

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights");
      if (res.status === 404) {
        setData(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Insights request failed (${res.status})`);
      }
      setData((await res.json()) as InsightsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-8 w-64 skeleton-shimmer" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 skeleton-shimmer" />
          ))}
        </div>
        <Skeleton className="h-10 w-full skeleton-shimmer" />
        <Skeleton className="h-64 w-full skeleton-shimmer" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <section className="border-b border-border pb-10 pt-2 anim-fade-up">
          <p className="text-muted-foreground mb-6" style={monoStyle}>
            Insights
          </p>
          <h1
            className="text-foreground leading-none"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 400,
            }}
          >
            Market <span className="text-primary">Insights</span>
          </h1>
          <div className="section-divider mt-5" />
        </section>
        <div className="bg-card border rounded-lg p-8 text-center space-y-3 mt-8 anim-fade-up-1">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-muted-foreground">Couldn&apos;t load insights.</p>
          <p className="text-xs text-muted-foreground/70">{error}</p>
          <button
            onClick={load}
            className="text-primary text-sm hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.meta.realisticJobs < 2) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <section className="border-b border-border pb-10 pt-2 anim-fade-up">
          <p className="text-muted-foreground mb-6" style={monoStyle}>
            Insights
          </p>
          <h1
            className="text-foreground leading-none"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 400,
            }}
          >
            Market <span className="text-primary">Insights</span>
          </h1>
          <div className="section-divider mt-5" />
        </section>
        <div className="bg-card border rounded-lg p-8 text-center space-y-3 mt-8 anim-fade-up-1">
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
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Header — editorial masthead */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <p className="text-muted-foreground" style={monoStyle}>
            Insights · {meta.realisticJobs} of {meta.totalJobs} jobs scoring 60+
          </p>
          {data.revalidating && (
            <span
              className="inline-flex items-center gap-1.5 text-muted-foreground/70"
              style={monoStyle}
              title="Refreshing in the background"
            >
              <RefreshCw className="w-3 h-3 animate-spin" /> refreshing
            </span>
          )}
        </div>
        <h1
          className="text-foreground leading-none"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: "clamp(2.5rem, 6vw, 4rem)",
            fontWeight: 400,
          }}
        >
          {meta.realisticJobs}{" "}
          <span className="text-primary">realistic</span> targets
        </h1>
        {meta.topFinding && (
          <p
            className="text-muted-foreground mt-4 max-w-lg leading-relaxed"
            style={{ fontFamily: "var(--font-geist-sans)", fontSize: "0.875rem" }}
          >
            {meta.topFinding}
          </p>
        )}
        <div className="section-divider mt-5" />
      </section>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 anim-fade-up-1">
        <div className="bg-card border rounded-lg p-4 card-hover">
          <div className="text-2xl font-bold">{meta.realisticJobs}</div>
          <div className="label-mono text-muted-foreground">realistic targets</div>
        </div>
        <div className="bg-card border rounded-lg p-4 card-hover">
          <div className="text-2xl font-bold">{meta.clusterCount}</div>
          <div className="label-mono text-muted-foreground">role profiles</div>
        </div>
        <div className="bg-card border rounded-lg p-4 card-hover">
          <div className="text-2xl font-bold text-red-400">{meta.gapCount}</div>
          <div className="label-mono text-muted-foreground">key gaps</div>
        </div>
        <div className="bg-card border rounded-lg p-4 card-hover">
          <div className="text-2xl font-bold text-emerald-400">{meta.avgScore}%</div>
          <div className="label-mono text-muted-foreground">avg match</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="anim-fade-up-2">
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
    </div>
  );
}
