"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

const DEFAULT_VISIBLE = 15;

export function DemandTab({
  patterns,
  clusters,
}: {
  patterns: DemandPattern[];
  clusters: Cluster[];
}) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const handleFilterChange = (value: Status | "all") => {
    setFilter(value);
    setShowAll(false);
  };

  const clusterIndex = new Map(clusters.map((c, i) => [c.name, i]));
  const filtered =
    filter === "all" ? patterns : patterns.filter((p) => p.status === filter);
  const maxFreq = Math.max(...patterns.map((p) => p.frequency), 1);
  const displayList = showAll ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const hasMore = filtered.length > DEFAULT_VISIBLE;

  return (
    <div className="space-y-4 pt-4">
      {/* Filter pills */}
      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
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
        {displayList.map((p) => {
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

      {/* Show more / fewer toggle */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="label-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            {showAll ? (
              <>Show fewer <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>Show all {filtered.length} skills <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No skills match this filter.
        </p>
      )}
    </div>
  );
}
