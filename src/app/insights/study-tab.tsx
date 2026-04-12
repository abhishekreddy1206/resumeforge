"use client";

import { useState } from "react";
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
  const [generating, setGenerating] = useState<number | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const handleGenerate = async (topic: LearnTopic) => {
    if (generating !== null) return;
    setGenerating(topic.rank);
    setGenError(null);
    try {
      const res = await fetch("/api/learn/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.topic }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.slug) {
        window.location.href = `/learn/${data.slug}`;
      } else {
        setGenError(data?.error || "Failed to generate guide.");
        setGenerating(null);
      }
    } catch {
      setGenError("Something went wrong. Please try again.");
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Topics ranked by ROI — studying these would improve your match across the
        most realistic targets. Based on gaps from your{" "}
        <strong className="text-foreground">{realisticJobCount} jobs</strong>{" "}
        scoring 60+.
      </p>

      {genError && (
        <p className="text-xs text-destructive text-center">{genError}</p>
      )}

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
                {topic.existingGuide ? (
                  <a
                    href={`/learn/${encodeURIComponent(topic.topic.toLowerCase().replace(/\s+/g, "-"))}`}
                    className="text-xs bg-primary/20 border border-primary/30 text-primary px-3 py-1 rounded-md hover:bg-primary/30 transition-colors"
                  >
                    View Guide →
                  </a>
                ) : (
                  <button
                    onClick={() => handleGenerate(topic)}
                    disabled={generating !== null}
                    className="text-xs bg-primary/20 border border-primary/30 text-primary px-3 py-1 rounded-md hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    {generating === topic.rank ? (
                      <span className="flex items-center gap-1">
                        Generating<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
                      </span>
                    ) : "Generate Guide →"}
                  </button>
                )}
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
