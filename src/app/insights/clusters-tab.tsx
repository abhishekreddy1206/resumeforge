"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { CLUSTER_COLORS, OTHER_CLUSTER_COLOR } from "./page";

interface Cluster {
  name: string;
  description: string;
  jobIds: string[];
  jobs: Array<{ id: string; title: string; company: string; score: number }>;
  topSkills: string[];
  avgScore: number;
}

const OTHER_CLUSTER_NAME = "Other Targets";

export function ClustersTab({
  clusters,
  summary,
}: {
  clusters: Cluster[];
  summary: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const renderable = clusters.filter((c) => c.jobs.length > 0);

  return (
    <div className="space-y-4 pt-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {renderable.map((cluster, i) => {
          const isOther = cluster.name === OTHER_CLUSTER_NAME;
          const colors = isOther
            ? OTHER_CLUSTER_COLOR
            : CLUSTER_COLORS[i % CLUSTER_COLORS.length];
          const isOpen = expanded === cluster.name;

          return (
            <div
              key={cluster.name}
              className={`border rounded-lg p-4 ${colors.border} ${colors.bg} card-hover`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{cluster.name}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${colors.badge} ${colors.text}`}
                >
                  {cluster.jobs.length} jobs
                </span>
              </div>

              {isOther ? (
                <div className="text-[10px] text-muted-foreground/80 italic mb-2">
                  Not grouped by AI — review manually.
                </div>
              ) : null}

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
                    <a
                      key={job.id}
                      href={`/jobs#${job.id}`}
                      className="flex items-center justify-between text-xs group hover:text-primary transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{job.title}</span>
                        <span className="text-muted-foreground group-hover:text-primary/60">
                          {" "}
                          · {job.company}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className="font-mono text-xs">{job.score}%</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                    </a>
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
