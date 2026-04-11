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
