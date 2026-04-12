"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GuideRenderer } from "@/components/learn/guide-renderer";
import { RefinePanel } from "@/components/learn/refine-panel";
import { ArrowLeft, Clock, Signal, BookOpen, Sparkles, RotateCcw } from "lucide-react";
import type { GuideContent } from "@/lib/claude/skills/guide-generator";

interface GuideData {
  id: string;
  topic: string;
  slug: string;
  content: GuideContent;
  version: number;
  status: string;
  completionStatus: string;
  sectionProgress: Record<string, { quizzesCompleted: number[]; scenariosRevealed: number[] }>;
  sources: Array<{ id: string; type: string; url: string | null; title: string | null; createdAt: string }>;
  versions: Array<{ id: string; version: number; changeDescription: string | null; createdAt: string }>;
}

export default function GuideViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stalePolls, setStalePolls] = useState(0);
  const [resuming, setResuming] = useState(false);
  const lastPctRef = useRef(0);

  const fetchGuide = useCallback(async () => {
    try {
      const res = await fetch(`/api/learn/guides/${slug}`);
      if (!res.ok) { setError("Guide not found"); return; }
      setGuide(await res.json());
    } catch {
      setError("Failed to load guide");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchGuide(); }, [fetchGuide]);

  // Poll for updates while guide is generating
  useEffect(() => {
    if (!guide || guide.status !== "generating") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/learn/guides/${slug}`);
        if (res.ok) {
          const updated = await res.json();
          setGuide(updated);
          if (updated.status !== "generating") {
            clearInterval(interval);
            setStalePolls(0);
          } else {
            const readySections = (updated.content as GuideContent).sections.filter(
              (s: GuideContent["sections"][number]) => s.explanation.length > 0
            ).length;
            const totalSections = (updated.content as GuideContent).sections.length;
            const pct = totalSections > 0 ? Math.round((readySections / totalSections) * 100) : 0;
            if (pct === lastPctRef.current) {
              setStalePolls((prev) => prev + 1);
            } else {
              setStalePolls(0);
              lastPctRef.current = pct;
            }
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [guide?.status, slug]);

  const handleResumeGeneration = useCallback(async () => {
    if (!guide || resuming) return;
    setResuming(true);
    setStalePolls(0);
    try {
      const res = await fetch(`/api/learn/guides/${guide.id}/resume`, { method: "POST" });
      if (res.ok) {
        // Re-fetch to pick up "generating" status and restart polling
        await fetchGuide();
      }
    } catch {
      // ignore
    } finally {
      setResuming(false);
    }
  }, [guide, resuming, fetchGuide]);

  const handleProgressUpdate = useCallback(async (progress: Record<string, { quizzesCompleted: number[]; scenariosRevealed: number[] }>) => {
    if (!guide) return;

    const sections = guide.content.sections;
    let allComplete = true;
    let anyStarted = false;

    for (const section of sections) {
      const p = progress[section.id];
      const totalQuizzes = section.knowledgeChecks.filter((k) => k.type === "quiz").length;
      const totalScenarios = section.interviewScenarios.length;
      if (totalQuizzes + totalScenarios === 0) continue;
      if (p) {
        if (p.quizzesCompleted.length > 0 || p.scenariosRevealed.length > 0) anyStarted = true;
        if (p.quizzesCompleted.length < totalQuizzes || p.scenariosRevealed.length < totalScenarios) allComplete = false;
      } else {
        allComplete = false;
      }
    }

    const completionStatus = allComplete ? "completed" : anyStarted ? "in_progress" : "not_started";

    await fetch(`/api/learn/guides/${guide.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionProgress: progress, completionStatus }),
    });
  }, [guide]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <Skeleton className="h-4 w-24 mb-6 skeleton-shimmer" />
        <Skeleton className="h-10 w-96 mb-3 skeleton-shimmer" />
        <Skeleton className="h-4 w-64 mb-8 skeleton-shimmer" />
        <div className="flex gap-8">
          <Skeleton className="hidden lg:block w-56 h-64 skeleton-shimmer" />
          <Skeleton className="flex-1 h-96 skeleton-shimmer" />
        </div>
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground">{error || "Guide not found"}</p>
        <a href="/learn" className="label-mono text-primary hover:text-primary/80 mt-4 inline-block transition-colors">Back to Learn</a>
      </div>
    );
  }

  const difficultyColor = guide.content.difficulty === "advanced"
    ? "text-destructive"
    : guide.content.difficulty === "intermediate"
    ? "text-primary"
    : "text-chart-3";

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8 anim-fade-up">
        <a href="/learn" className="label-mono text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Learn
        </a>
        <span className="label-mono text-muted-foreground/60">v{guide.version}</span>
      </div>

      {/* Guide masthead */}
      <div className="mb-10 anim-fade-up-1">
        <h1
          className="text-2xl sm:text-3xl tracking-tight text-gradient mb-3"
          style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 500 }}
        >
          {guide.content.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <span className={`label-mono flex items-center gap-1 ${difficultyColor}`}>
            <Signal className="w-3 h-3" />
            {guide.content.difficulty}
          </span>
          <span className="label-mono text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {guide.content.estimatedMinutes} min
          </span>
          <span className="label-mono text-muted-foreground flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {guide.content.sections.length} sections
          </span>
        </div>
        {guide.content.prerequisites.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="label-mono mr-2">Prerequisites:</span>
            {guide.content.prerequisites.join(" · ")}
          </div>
        )}
        <div className="section-divider mt-5" />
      </div>

      {/* Generation progress */}
      {guide.status === "generating" && (() => {
        const readySections = guide.content.sections.filter((s) => s.explanation.length > 0).length;
        const totalSections = guide.content.sections.length;
        const pct = totalSections > 0 ? Math.round((readySections / totalSections) * 100) : 0;
        return (
          <div className="mb-8 border border-primary/20 bg-primary/5 rounded px-5 py-4 anim-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">Generating sections...</span>
              <span className="label-mono text-primary ml-auto">{pct}%</span>
            </div>
            <div className="bg-muted rounded-full h-1.5 overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out bg-primary"
                style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {guide.content.sections.map((s) => {
                const isReady = s.explanation.length > 0;
                return (
                  <span
                    key={s.id}
                    className={`label-mono px-2 py-0.5 rounded ${
                      isReady ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isReady ? "\u2713" : "\u2022"} {s.title}
                  </span>
                );
              })}
            </div>
            <p className="label-mono text-muted-foreground/60 mt-2">
              {readySections} of {totalSections} sections ready
            </p>
            {stalePolls >= 6 && (
              <div className="mt-3 pt-3 border-t border-primary/10 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Generation may have stalled.</span>
                <button
                  onClick={handleResumeGeneration}
                  disabled={resuming}
                  className="label-mono text-primary hover:text-primary/80 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className={`w-3 h-3 ${resuming ? "animate-spin" : ""}`} />
                  {resuming ? "Resuming..." : "Retry"}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Failed state — offer retry */}
      {guide.status === "failed" && guide.content.sections.some((s) => s.explanation.length === 0) && (
        <div className="mb-8 border border-destructive/20 bg-destructive/5 rounded px-5 py-4 anim-fade-up">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Some sections failed to generate.
            </span>
            <button
              onClick={handleResumeGeneration}
              disabled={resuming}
              className="label-mono text-primary hover:text-primary/80 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className={`w-3 h-3 ${resuming ? "animate-spin" : ""}`} />
              {resuming ? "Retrying..." : "Retry Failed Sections"}
            </button>
          </div>
        </div>
      )}

      {/* Guide content */}
      <div className="anim-fade-up-2">
        <GuideRenderer
          guideId={guide.id}
          content={guide.content}
          initialProgress={guide.sectionProgress}
          onProgressUpdate={handleProgressUpdate}
        />
      </div>

      {/* Refine panel — hidden during generation to prevent race conditions */}
      <div className="mt-16 anim-fade-up-3">
        <div className="section-divider mb-6" />
        {guide.status === "generating" ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            Guide is still generating. Refinement will be available once all sections are complete.
          </div>
        ) : (
          <RefinePanel
            guideId={guide.id}
            existingSources={guide.sources}
            onRefined={() => fetchGuide()}
          />
        )}
      </div>
    </div>
  );
}
