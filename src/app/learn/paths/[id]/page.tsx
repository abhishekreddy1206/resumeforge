"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { LearningPathGraph } from "@/components/learn/learning-path-graph";
import { ArrowLeft, ArrowRight, BookOpen, Sparkles } from "lucide-react";

interface GuideItem {
  id: string;
  topic: string;
  slug: string;
  status: string;
  completionStatus: "not_started" | "in_progress" | "completed";
  version: number;
  category: string | null;
  updatedAt: string;
  sectionProgress: string;
  sourceCount: number;
}

interface PathData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  guideOrder: string[];
  profileId: string;
  createdAt: string;
  updatedAt: string;
  guides: GuideItem[];
}

export default function PathDetailPage() {
  const params = useParams();
  const pathId = params.id as string;

  const [path, setPath] = useState<PathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Curriculum generation
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const fetchPath = useCallback(async () => {
    try {
      const res = await fetch(`/api/learn/paths/${pathId}`);
      if (!res.ok) {
        setError("Failed to load learning path");
        return;
      }
      setPath(await res.json());
    } catch {
      setError("Failed to load learning path");
    } finally {
      setLoading(false);
    }
  }, [pathId]);

  useEffect(() => {
    fetchPath();
  }, [fetchPath]);

  // Poll while any guide is still generating
  useEffect(() => {
    if (!path) return;
    const hasGenerating = path.guides.some((g) => g.status === "generating");
    if (!hasGenerating) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/learn/paths/${pathId}`);
        if (res.ok) {
          const updated = await res.json();
          setPath(updated);
          const stillGenerating = updated.guides.some((g: GuideItem) => g.status === "generating");
          if (!stillGenerating) clearInterval(interval);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [path?.guides.map((g) => g.status).join(","), pathId]);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/learn/paths/${pathId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await fetchPath();
      } else {
        const errData = await res.json().catch(() => null);
        setGenError(errData?.error || "Failed to generate curriculum.");
      }
    } catch {
      setGenError("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [generating, pathId, fetchPath]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-6 w-24 rounded skeleton-shimmer" />
        <Skeleton className="h-24 rounded-lg skeleton-shimmer" />
        <Skeleton className="h-48 rounded-lg skeleton-shimmer" />
        <Skeleton className="h-48 rounded-lg skeleton-shimmer" />
      </div>
    );
  }

  if (error || !path) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 label-mono text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Learn
        </Link>
        <div className="text-center py-16 border border-dashed border-border rounded">
          <p className="text-sm text-muted-foreground">{error ?? "Path not found."}</p>
        </div>
      </div>
    );
  }

  const totalGuides = path.guides.length;
  const completedCount = path.guides.filter((g) => g.completionStatus === "completed").length;
  const progressPct = totalGuides > 0 ? Math.round((completedCount / totalGuides) * 100) : 0;
  const hasGeneratingGuides = path.guides.some((g) => g.status === "generating");

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-10">
      {/* Back link */}
      <div className="anim-fade-up">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 label-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Learn
        </Link>
      </div>

      {/* Path masthead */}
      <div className="anim-fade-up-1">
        <h1
          className="text-3xl sm:text-4xl tracking-tight text-gradient"
          style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 500 }}
        >
          {path.title}
        </h1>
        {path.description && (
          <p
            className="text-sm text-muted-foreground mt-2"
            style={{ fontFamily: "var(--font-geist-sans)", maxWidth: "36rem" }}
          >
            {path.description}
          </p>
        )}

        {/* Overall progress */}
        <div className="mt-5 max-w-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="label-mono text-muted-foreground">
              {completedCount} of {totalGuides} guide{totalGuides !== 1 ? "s" : ""} complete
            </span>
            <span
              className="label-mono"
              style={{
                color:
                  progressPct >= 100
                    ? "oklch(0.55 0.15 150)"
                    : progressPct > 0
                    ? "var(--primary)"
                    : "var(--muted-foreground)",
              }}
            >
              {progressPct}%
            </span>
          </div>
          <div className="bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(progressPct, progressPct > 0 ? 2 : 0)}%`,
                backgroundColor:
                  progressPct >= 100 ? "oklch(0.55 0.15 150)" : "var(--primary)",
                opacity: progressPct === 0 ? 0.2 : 1,
              }}
            />
          </div>
        </div>

        <div className="section-divider mt-6" />
      </div>

      {/* Interactive learning path graph */}
      {totalGuides >= 2 && (
        <section className="anim-fade-up-1">
          <LearningPathGraph
            guides={path.guides}
            guideOrder={path.guideOrder}
          />
        </section>
      )}

      {/* Ordered guide list */}
      <section className="anim-fade-up-2 space-y-4">
        <span className="label-mono text-muted-foreground">
          {totalGuides} Guide{totalGuides !== 1 ? "s" : ""}
        </span>

        {totalGuides === 0 ? (
          <div className="border border-dashed border-border rounded py-12 flex flex-col items-center gap-3 text-muted-foreground">
            {generating ? (
              <>
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                <p className="text-sm text-foreground">Generating curriculum for <strong>{path.title}</strong></p>
                <p className="text-xs text-muted-foreground">
                  Planning topics and creating study guides<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">This may take a few minutes.</p>
              </>
            ) : (
              <>
                <BookOpen className="w-6 h-6 opacity-40" />
                <p className="text-sm">No guides in this path yet.</p>
                <button
                  onClick={handleGenerate}
                  data-slot="button"
                  className="mt-2 bg-primary text-primary-foreground px-5 py-2.5 rounded text-sm font-medium transition-all flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Curriculum
                </button>
                {genError && (
                  <p className="text-sm text-destructive mt-2">{genError}</p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Generation banner when guides are being generated */}
            {hasGeneratingGuides && (
              <div className="border border-primary/20 bg-primary/5 rounded px-4 py-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-sm text-foreground">
                  Generating guide content...
                </span>
                <span className="label-mono text-muted-foreground/60 ml-auto">
                  {path.guides.filter((g) => g.status !== "generating").length} of {totalGuides} ready
                </span>
              </div>
            )}

            {path.guides.map((guide, i) => (
              <div key={guide.id}>
                {/* Guide card */}
                <Link
                  href={`/learn/${guide.slug}`}
                  className="bg-card border border-border rounded card-hover block"
                >
                  <div className="px-5 py-4 flex items-center gap-4">
                    {/* Order number */}
                    <div className="shrink-0 w-7 h-7 rounded-full border border-border flex items-center justify-center">
                      <span className="label-mono text-muted-foreground/60 text-[11px]">{i + 1}</span>
                    </div>

                    {/* Guide info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-base font-medium group-hover:text-primary transition-colors truncate"
                          style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600, fontSize: "1.1rem" }}
                        >
                          {guide.topic}
                        </span>
                        {guide.status === "generating" && (
                          <span className="label-mono text-primary flex items-center gap-1 shrink-0">
                            <Sparkles className="w-3 h-3 animate-pulse" />
                            Generating
                          </span>
                        )}
                      </div>
                      <div className="label-mono text-muted-foreground/60 mt-0.5">
                        {guide.sourceCount} source{guide.sourceCount !== 1 ? "s" : ""}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      className="label-mono shrink-0"
                      style={{
                        color:
                          guide.completionStatus === "completed"
                            ? "oklch(0.55 0.15 150)"
                            : guide.completionStatus === "in_progress"
                            ? "var(--primary)"
                            : "var(--muted-foreground)",
                        opacity: guide.completionStatus === "not_started" ? 0.5 : 1,
                      }}
                    >
                      {guide.completionStatus === "completed"
                        ? "Completed"
                        : guide.completionStatus === "in_progress"
                        ? "In Progress"
                        : "Not Started"}
                    </span>

                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
