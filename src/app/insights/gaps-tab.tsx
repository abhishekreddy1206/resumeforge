"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

const DEFAULT_GAPS = 8;
const DEFAULT_BRIDGES = 5;

export function GapsTab({
  analysis,
  clusters,
}: {
  analysis: GapAnalysis;
  clusters: Cluster[];
}) {
  const clusterIndex = new Map(clusters.map((c, i) => [c.name, i]));
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [showAllBridges, setShowAllBridges] = useState(false);
  const [showStrengths, setShowStrengths] = useState(false);

  const displayGaps = showAllGaps ? analysis.gaps : analysis.gaps.slice(0, DEFAULT_GAPS);
  const displayBridges = showAllBridges ? analysis.bridges : analysis.bridges.slice(0, DEFAULT_BRIDGES);

  return (
    <div className="space-y-6 pt-4">
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

      {/* Pure Gaps section */}
      {analysis.gaps.length > 0 && (
        <div className="space-y-2">
          <div className="label-mono text-muted-foreground">Pure Gaps</div>
          {displayGaps.map((gap) => (
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
          {analysis.gaps.length > DEFAULT_GAPS && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowAllGaps(!showAllGaps)}
                className="label-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                {showAllGaps ? (
                  <>Show fewer <ChevronDown className="w-3 h-3 rotate-180" /></>
                ) : (
                  <>Show all {analysis.gaps.length} gaps <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bridgeable Skills section */}
      {analysis.bridges.length > 0 && (
        <div className="space-y-2">
          <div className="label-mono text-muted-foreground">Bridgeable Skills</div>
          {displayBridges.map((bridge) => (
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
          {analysis.bridges.length > DEFAULT_BRIDGES && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowAllBridges(!showAllBridges)}
                className="label-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                {showAllBridges ? (
                  <>Show fewer <ChevronDown className="w-3 h-3 rotate-180" /></>
                ) : (
                  <>Show all {analysis.bridges.length} bridgeable <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Strong Matches section (collapsible) */}
      {analysis.strengths.length > 0 && (
        <div>
          <button
            onClick={() => setShowStrengths(!showStrengths)}
            className="label-mono text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            {showStrengths ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {analysis.strengths.length} Strong Matches
          </button>
          {showStrengths && (
            <div className="mt-2 space-y-2 anim-fade-up">
              {analysis.strengths.map((s) => (
                <div
                  key={s.skill}
                  className="border border-emerald-500/20 border-l-[3px] border-l-emerald-500/60 rounded-lg p-3 bg-emerald-500/[0.02]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{s.skill}</span>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                        strong
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {s.frequency} jobs
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {s.clusters.map((cn) => {
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {analysis.gaps.length === 0 && analysis.bridges.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No gaps found — you&apos;re a strong match across all realistic
          targets.
        </p>
      )}
    </div>
  );
}
