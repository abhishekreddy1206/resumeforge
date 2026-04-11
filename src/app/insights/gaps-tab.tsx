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
