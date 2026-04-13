"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Trash2, ExternalLink, FileWarning, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SavedSourceVersionItem {
  id: string;
  version: number;
  url: string;
  title: string;
  captureMethod: string | null;
  captureDecisionReason: string | null;
  captureDiagnostics: {
    scrapedWordCount: number;
    fallbackWordCount: number;
    selectedSelector: string | null;
    selectedTextLength: number | null;
    bodyTextLength: number | null;
    candidateLengths: Record<string, number>;
    finalUrl: string;
  } | null;
  publisher: string | null;
  publishedAt: string | null;
  wordCount: number;
  reviewFlags: string[];
  reviewSummary: string | null;
  changeType: string;
  createdAt: string;
}

interface ImpactedGuideItem {
  guideId: string;
  guideSlug: string;
  guideTopic: string;
  guideVersion: number;
  guideSourceId: string;
  guideSourceVersionId: string | null;
  attachedSourceVersion: number | null;
  headSourceVersion: number;
  isStale: boolean;
  updatedAt: string;
}

interface SavedSourceDetail {
  id: string;
  type: string;
  url: string;
  title: string;
  content: string;
  version: number;
  wordCount: number;
  captureMethod: string | null;
  captureDecisionReason: string | null;
  captureDiagnostics: {
    scrapedWordCount: number;
    fallbackWordCount: number;
    selectedSelector: string | null;
    selectedTextLength: number | null;
    bodyTextLength: number | null;
    candidateLengths: Record<string, number>;
    finalUrl: string;
  } | null;
  publisher: string | null;
  publishedAt: string | null;
  lastRefreshedAt: string | null;
  reviewFlags: string[];
  reviewSummary: string | null;
  deletedAt: string | null;
  createdAt: string;
  preview: string;
  refreshable: boolean;
  versions: SavedSourceVersionItem[];
  impactedGuides: ImpactedGuideItem[];
}

interface RefreshOutcome {
  status: "updated" | "unchanged" | "rejected_degradation";
  message?: string;
  rejectionReasons?: string[];
  candidate?: {
    wordCount: number;
    captureMethod: string | null;
    captureDecisionReason: string | null;
    reviewFlags: string[];
    reviewSummary: string | null;
    captureDiagnostics: SavedSourceDetail["captureDiagnostics"] | null;
  };
}

export default function LearnSourceReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [source, setSource] = useState<SavedSourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome | null>(null);

  const loadSource = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/learn/sources/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to load source");
      }
      setSource(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load source");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSource();
  }, [loadSource]);

  const handleRefresh = async () => {
    if (!source?.refreshable || refreshing) return;
    setRefreshing(true);
    setRefreshOutcome(null);
    try {
      const res = await fetch(`/api/learn/sources/${source.id}/refresh`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Refresh failed");
      }
      if (data?.status === "rejected_degradation") {
        setRefreshOutcome({
          status: "rejected_degradation",
          message: data.message,
          rejectionReasons: data.rejectionReasons,
          candidate: data.candidate,
        });
        return;
      }
      setRefreshOutcome({
        status: data?.status === "unchanged" ? "unchanged" : "updated",
        message: data?.status === "unchanged"
          ? "Refresh completed, but the saved extract did not materially change."
          : "Refresh completed and the saved extract was updated.",
      });
      await loadSource();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!source || deleting) return;
    if (!window.confirm("Delete this saved source from normal lists? Existing guide content will stay unchanged.")) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/learn/sources/${source.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Delete failed");
      }
      await loadSource();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-4 w-28 skeleton-shimmer" />
        <Skeleton className="h-12 w-96 skeleton-shimmer" />
        <Skeleton className="h-32 w-full skeleton-shimmer" />
        <Skeleton className="h-56 w-full skeleton-shimmer" />
      </div>
    );
  }

  if (!source || error) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <Link href="/learn" className="label-mono text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Learn
        </Link>
        <div className="mt-6 border border-destructive/20 bg-destructive/5 rounded px-4 py-3 text-sm text-destructive">
          {error || "Saved source not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      <div className="anim-fade-up">
        <Link href="/learn" className="label-mono text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Learn
        </Link>
      </div>

      <section className="anim-fade-up-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-mono text-muted-foreground">{source.type}</span>
              <span className="label-mono text-muted-foreground">v{source.version}</span>
              {source.deletedAt && (
                <span className="label-mono px-2 py-0.5 rounded bg-destructive/10 text-destructive">Deleted</span>
              )}
            </div>
            <h1
              className="text-2xl sm:text-3xl tracking-tight text-gradient"
              style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 500 }}
            >
              {source.title}
            </h1>
            <div className="text-sm text-muted-foreground break-all">{source.url}</div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{source.wordCount} words</span>
              <span>{source.captureMethod || "unknown capture"}</span>
              {source.captureDecisionReason && <span>{source.captureDecisionReason}</span>}
              {source.publisher && <span>{source.publisher}</span>}
              {source.publishedAt && <span>{source.publishedAt}</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {source.refreshable && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                data-slot="button"
                className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            )}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-muted text-foreground px-4 py-2 rounded text-sm font-medium inline-flex items-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Replace from Extension
            </a>
            <button
              onClick={handleDelete}
              disabled={deleting}
              data-slot="button"
              className="bg-destructive/10 text-destructive px-4 py-2 rounded text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 border border-destructive/20 bg-destructive/5 rounded px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {refreshOutcome && (
          <div
            className={`mt-4 rounded px-4 py-3 text-sm ${
              refreshOutcome.status === "rejected_degradation"
                ? "border border-amber-500/30 bg-amber-500/10 text-foreground"
                : "border border-primary/20 bg-primary/5 text-foreground"
            }`}
          >
            <p>{refreshOutcome.message}</p>
            {refreshOutcome.rejectionReasons && refreshOutcome.rejectionReasons.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Rejection reasons: {refreshOutcome.rejectionReasons.join(", ")}
              </p>
            )}
            {refreshOutcome.candidate && (
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <div>Candidate words: {refreshOutcome.candidate.wordCount}</div>
                <div>Candidate capture: {refreshOutcome.candidate.captureMethod || "unknown"}</div>
                {refreshOutcome.candidate.captureDecisionReason && (
                  <div>Candidate decision: {refreshOutcome.candidate.captureDecisionReason}</div>
                )}
                {refreshOutcome.candidate.reviewFlags.length > 0 && (
                  <div>Candidate flags: {refreshOutcome.candidate.reviewFlags.join(", ")}</div>
                )}
                {refreshOutcome.candidate.captureDiagnostics?.selectedSelector && (
                  <div>Candidate selector: {refreshOutcome.candidate.captureDiagnostics.selectedSelector}</div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 anim-fade-up-2">
        <div className="bg-card border border-border rounded p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileWarning className="w-4 h-4 text-muted-foreground" />
            <span className="label-mono text-muted-foreground">Review</span>
          </div>
          <div className="space-y-3">
            {source.reviewFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deterministic review flags were raised for this extract.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {source.reviewFlags.map((flag) => (
                    <span key={flag} className="label-mono px-2 py-1 rounded bg-amber-500/10 text-amber-700">
                      {flag}
                    </span>
                  ))}
                </div>
                {source.reviewSummary && (
                  <p className="text-sm text-muted-foreground">{source.reviewSummary}</p>
                )}
              </>
            )}

            <div className="pt-3 border-t border-border">
              <div className="label-mono text-muted-foreground mb-2">Capture Decision</div>
              <div className="text-sm">
                {source.captureMethod || "unknown"}
                {source.captureDecisionReason ? ` · ${source.captureDecisionReason}` : ""}
              </div>
              {source.captureDiagnostics && (
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <div>Scraped words: {source.captureDiagnostics.scrapedWordCount}</div>
                  <div>Fallback words: {source.captureDiagnostics.fallbackWordCount}</div>
                  {source.captureDiagnostics.selectedSelector && (
                    <div>Fallback selector: {source.captureDiagnostics.selectedSelector}</div>
                  )}
                  {source.captureDiagnostics.selectedTextLength !== null && (
                    <div>Selected DOM text length: {source.captureDiagnostics.selectedTextLength}</div>
                  )}
                  {source.captureDiagnostics.bodyTextLength !== null && (
                    <div>Clean body text length: {source.captureDiagnostics.bodyTextLength}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="label-mono text-muted-foreground">Impacted Guides</span>
          </div>
          {source.impactedGuides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guides are currently pinned to this source.</p>
          ) : (
            <div className="space-y-3">
              {source.impactedGuides.map((guide) => (
                <a
                  key={guide.guideSourceId}
                  href={`/learn/${guide.guideSlug}`}
                  className="block rounded border border-border px-3 py-2 hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="text-sm font-medium">{guide.guideTopic}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Guide v{guide.guideVersion}
                    {guide.attachedSourceVersion ? ` · source v${guide.attachedSourceVersion}` : ""}
                    {guide.isStale ? ` · stale vs v${guide.headSourceVersion}` : ""}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid lg:grid-cols-[1.25fr_0.75fr] gap-6 anim-fade-up-3">
        <div className="bg-card border border-border rounded p-5">
          <div className="label-mono text-muted-foreground mb-3">Current Extract Preview</div>
          <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground font-sans max-h-[28rem] overflow-y-auto">
            {source.preview}
          </pre>
        </div>

        <div className="bg-card border border-border rounded p-5">
          <div className="label-mono text-muted-foreground mb-3">Version History</div>
          <div className="space-y-3 max-h-[28rem] overflow-y-auto">
            {source.versions.map((version) => (
              <div key={version.id} className="rounded border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-mono text-foreground">v{version.version}</span>
                  <span className="label-mono text-muted-foreground">{version.changeType}</span>
                </div>
                <div className="text-sm mt-1">{version.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {version.captureMethod || "unknown"} · {version.wordCount} words
                </div>
                {version.captureDecisionReason && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {version.captureDecisionReason}
                  </div>
                )}
                {version.reviewFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {version.reviewFlags.map((flag) => (
                      <span key={`${version.id}-${flag}`} className="label-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
