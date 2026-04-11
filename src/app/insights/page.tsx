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
