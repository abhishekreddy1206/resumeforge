"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef, use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GuideRenderer } from "@/components/learn/guide-renderer";
import { RefinePanel } from "@/components/learn/refine-panel";
import { ArrowLeft, Clock, Signal, BookOpen, Sparkles, RotateCcw } from "lucide-react";
import type { GuideContent, SectionGenStatus } from "@/lib/claude/skills/guide-generator";

interface GuideData {
  id: string;
  topic: string;
  slug: string;
  content: GuideContent;
  version: number;
  status: string;
  generationState: "running" | "blocked" | "complete";
  completionStatus: string;
  lastAsyncError: string | null;
  lastAsyncStage: string | null;
  failedSectionIds: string[];
  sectionErrors: Record<string, string>;
  sectionProgress: Record<string, { quizzesCompleted: number[]; scenariosRevealed: number[] }>;
  sources: Array<{
    id: string;
    type: string;
    url: string | null;
    title: string | null;
    createdAt: string;
    savedSourceId?: string | null;
    savedSourceVersionId?: string | null;
  }>;
  versions: Array<{
    id: string;
    version: number;
    changeDescription: string | null;
    snapshotSemantics: string;
    sourceRefs: string | null;
    createdAt: string;
  }>;
  staleSources: Array<{
    savedSourceId: string | null;
    guideSourceId: string;
    sourceTitle: string | null;
    attachedVersion: number | null;
    headVersion: number | null;
    isStale: boolean;
    reviewUrl: string | null;
  }>;
}

export default function GuideViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const lastPctRef = useRef(0);
  const stalePollsRef = useRef(0);
  const resumingRef = useRef(false);

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

  // Poll for updates while guide is generating; auto-resume when stalled
  useEffect(() => {
    if (!guide || guide.status !== "generating") return;
    stalePollsRef.current = 0;
    lastPctRef.current = 0;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/learn/guides/${slug}`);
        if (!res.ok) return;
        const updated = await res.json();
        setGuide(updated);

        if (updated.status !== "generating" || updated.generationState === "complete") {
          clearInterval(interval);
          stalePollsRef.current = 0;
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statuses: Record<string, string> = (updated.content as any)._sectionStatuses || {};
        const completedCount = Object.values(statuses).filter((s) => s === "completed").length;
        const refiningCount = Object.values(statuses).filter((s) => s === "refining").length;
        // Fallback for legacy guides with no _sectionStatuses: count sections with empty explanation
        let pendingCount = Object.values(statuses).filter((s) => s === "pending").length;
        if (Object.keys(statuses).length === 0) {
          pendingCount = (updated.content as GuideContent).sections.filter(
            (s) => !s.explanation || s.explanation.length === 0
          ).length;
        }
        const totalSections = (updated.content as GuideContent).sections.length;
        const pct = totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;

        if (pct === lastPctRef.current) {
          stalePollsRef.current++;
        } else {
          stalePollsRef.current = 0;
          lastPctRef.current = pct;
        }

        // Auto-resume: if no progress for 4 polls (20s) and not already resuming
        // Do NOT auto-resume when sections are "refining" — the refine after() is still working
        // Only resume when there are pending sections (meaning initial generation stalled)
        if (stalePollsRef.current >= 4 && !resumingRef.current && pendingCount > 0 && refiningCount === 0) {
          resumingRef.current = true;
          setResuming(true);
          setResumeError(null);
          try {
            const resumeRes = await fetch(`/api/learn/guides/${updated.id}/resume`, { method: "POST" });
            if (resumeRes.ok) {
              stalePollsRef.current = 0;
              lastPctRef.current = 0;
              // Re-fetch immediately to pick up changes
              const freshRes = await fetch(`/api/learn/guides/${slug}`);
              if (freshRes.ok) setGuide(await freshRes.json());
            } else {
              const data = await resumeRes.json().catch(() => null);
              setResumeError(data?.error || "Resume failed");
            }
          } catch {
            setResumeError("Failed to resume generation");
          } finally {
            resumingRef.current = false;
            setResuming(false);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are intentionally narrow; we restart only on status/id/slug change, not every content update
  }, [guide?.status, guide?.id, slug]);

  const handleResumeGeneration = useCallback(async () => {
    if (!guide || resumingRef.current) return;
    resumingRef.current = true;
    setResuming(true);
    setResumeError(null);
    stalePollsRef.current = 0;
    try {
      const res = await fetch(`/api/learn/guides/${guide.id}/resume`, { method: "POST" });
      if (res.ok) {
        // Re-fetch to pick up updated content and restart polling
        await fetchGuide();
      } else {
        const data = await res.json().catch(() => null);
        setResumeError(data?.error || "Resume failed");
      }
    } catch {
      setResumeError("Failed to resume generation");
    } finally {
      resumingRef.current = false;
      setResuming(false);
    }
  }, [guide, fetchGuide]);

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
        <Link href="/learn" className="label-mono text-primary hover:text-primary/80 mt-4 inline-block transition-colors">Back to Learn</Link>
      </div>
    );
  }

  const difficultyColor = guide.content.difficulty === "advanced"
    ? "text-destructive"
    : guide.content.difficulty === "intermediate"
    ? "text-primary"
    : "text-chart-3";
  const asyncStageLabel = guide.lastAsyncStage?.replace(/_/g, " ");
  const staleSources = guide.staleSources.filter((source) => source.isStale);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8 anim-fade-up">
        <Link href="/learn" className="label-mono text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Learn
        </Link>
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

      {guide.lastAsyncError && (
        <div className="mb-6 border border-amber-500/30 bg-amber-500/10 rounded px-4 py-3 anim-fade-up">
          <p className="text-sm text-foreground">
            <span className="font-medium">Latest background issue{asyncStageLabel ? ` (${asyncStageLabel})` : ""}:</span>{" "}
            {guide.lastAsyncError}
          </p>
        </div>
      )}

      {staleSources.length > 0 && (
        <div className="mb-6 border border-blue-500/25 bg-blue-500/5 rounded px-4 py-3 anim-fade-up">
          <p className="text-sm text-foreground">
            <span className="font-medium">Newer saved article extract{staleSources.length > 1 ? "s are" : " is"} available:</span>{" "}
            this guide is still pinned to an older source version until you explicitly refine it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {staleSources.map((source) => {
              const label = `${source.sourceTitle || "Saved source"}${source.attachedVersion ? ` v${source.attachedVersion}` : ""}${source.headVersion ? ` → v${source.headVersion}` : ""}`;
              if (!source.reviewUrl) {
                return (
                  <span
                    key={source.guideSourceId}
                    className="label-mono px-2 py-1 rounded bg-blue-500/10 text-blue-700"
                  >
                    {label}
                  </span>
                );
              }
              return (
                <a
                  key={source.guideSourceId}
                  href={source.reviewUrl}
                  className="label-mono px-2 py-1 rounded bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 transition-colors"
                >
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Generation progress — per-section status */}
      {guide.status === "generating" && (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sectionStatuses: Record<string, SectionGenStatus> = (guide.content as any)._sectionStatuses || {};
        const completedCount = Object.values(sectionStatuses).filter((s) => s === "completed").length;
        const totalSections = guide.content.sections.length;
        const pct = totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;
        const isBlocked = guide.generationState === "blocked";

        const statusIcon = (status: SectionGenStatus | undefined) => {
          switch (status) {
            case "completed": return <span className="text-chart-3">{"\u2713"}</span>;
            case "generating": return <span className="text-primary animate-pulse">{"\u25CF"}</span>;
            case "failed": return <span className="text-destructive">{"\u2717"}</span>;
            case "refining": return <span className="text-blue-400 animate-pulse">{"\u21BB"}</span>;
            default: return <span className="text-muted-foreground">{"\u25CB"}</span>;
          }
        };

        return (
          <div className={`mb-8 rounded px-5 py-4 anim-fade-up ${isBlocked ? "border border-amber-500/25 bg-amber-500/10" : "border border-primary/20 bg-primary/5"}`}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className={`w-4 h-4 ${isBlocked ? "text-amber-600" : "text-primary animate-pulse"}`} />
              <span className="text-sm font-medium text-foreground">
                {isBlocked ? "Generation blocked" : "Generating sections..."}
              </span>
              <span className={`label-mono ml-auto ${isBlocked ? "text-amber-700" : "text-primary"}`}>{pct}%</span>
            </div>
            <div className="bg-muted rounded-full h-1.5 overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isBlocked ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {guide.content.sections.map((s) => {
                const status = sectionStatuses[s.id] || "pending";
                return (
                  <span
                    key={s.id}
                    className={`label-mono px-2 py-0.5 rounded flex items-center gap-1 ${
                      status === "completed" ? "bg-chart-3/20 text-chart-3" :
                      status === "generating" ? "bg-primary/20 text-primary" :
                      status === "failed" ? "bg-destructive/20 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {statusIcon(status)} {s.title}
                  </span>
                );
              })}
            </div>
            <p className="label-mono text-muted-foreground/60 mt-2">
              {completedCount} of {totalSections} sections ready
            </p>
            {isBlocked && guide.failedSectionIds.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-amber-500/15 pt-3">
                {guide.failedSectionIds.map((sectionId) => {
                  const section = guide.content.sections.find((item) => item.id === sectionId);
                  const error = guide.sectionErrors[sectionId];
                  return (
                    <div key={sectionId} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{section?.title || sectionId}:</span>{" "}
                      {error || "Generation stalled for this section."}
                    </div>
                  );
                })}
              </div>
            )}
            {!resuming && !resumeError && (
              <div className={`mt-3 pt-3 ${isBlocked ? "border-t border-amber-500/15" : "border-t border-primary/10"}`}>
                <button
                  onClick={handleResumeGeneration}
                  className="label-mono text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Resume Generation
                </button>
              </div>
            )}
            {resuming && (
              <div className={`mt-3 pt-3 flex items-center gap-2 ${isBlocked ? "border-t border-amber-500/15" : "border-t border-primary/10"}`}>
                <RotateCcw className="w-3 h-3 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground">Generating next batch of sections...</span>
              </div>
            )}
            {resumeError && (
              <div className="mt-3 pt-3 border-t border-destructive/10 flex items-center gap-3">
                <span className="text-xs text-destructive">{resumeError}</span>
                <button
                  onClick={handleResumeGeneration}
                  disabled={resuming}
                  className="label-mono text-primary hover:text-primary/80 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Failed state — offer retry with per-section details */}
      {guide.status === "failed" && (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statuses: Record<string, string> = (guide.content as any)._sectionStatuses || {};
        const failedSections = guide.content.sections.filter((s) => statuses[s.id] === "failed");
        if (failedSections.length === 0) return null;
        return (
          <div className="mb-8 border border-destructive/20 bg-destructive/5 rounded px-5 py-4 anim-fade-up">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {failedSections.length} section{failedSections.length > 1 ? "s" : ""} failed to generate.
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
            <div className="flex gap-2 flex-wrap">
              {failedSections.map((s) => (
                <span key={s.id} className="label-mono px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                  {s.title}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Guide content */}
      <div className="anim-fade-up-2">
        <GuideRenderer
          guideId={guide.id}
          content={guide.content}
          initialProgress={guide.sectionProgress}
          onProgressUpdate={handleProgressUpdate}
          existingSources={guide.sources}
          onRefined={fetchGuide}
        />
      </div>

      {/* Published but with some failed sections — offer retry */}
      {guide.status === "published" && (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statuses: Record<string, string> = (guide.content as any)._sectionStatuses || {};
        const failedSections = guide.content.sections.filter((s) => statuses[s.id] === "failed");
        if (failedSections.length === 0) return null;
        return (
          <div className="mb-8 border border-yellow-500/20 bg-yellow-500/5 rounded px-5 py-4 anim-fade-up">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {failedSections.length} section{failedSections.length > 1 ? "s" : ""} could not be generated.
              </span>
              <button
                onClick={handleResumeGeneration}
                disabled={resuming}
                className="label-mono text-primary hover:text-primary/80 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className={`w-3 h-3 ${resuming ? "animate-spin" : ""}`} />
                {resuming ? "Retrying..." : "Retry"}
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {failedSections.map((s) => (
                <span key={s.id} className="label-mono px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                  {s.title}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

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
