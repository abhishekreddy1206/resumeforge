"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Link2, FileText, Upload, BookmarkCheck, RefreshCw } from "lucide-react";
import { FileDropZone } from "@/components/learn/file-drop-zone";

interface Source {
  id: string;
  type: string;
  url?: string | null;
  title?: string | null;
  createdAt: string;
}

interface RefinePanelProps {
  guideId: string;
  existingSources: Source[];
  onRefined: () => void;
  sectionId?: string;
  sectionTitle?: string;
}

interface SavedSourceItem {
  id: string;
  type: string;
  url: string;
  title: string;
  createdAt: string;
  captureMethod?: string | null;
  refreshable?: boolean;
}

export function RefinePanel({ guideId, existingSources, onRefined, sectionId, sectionTitle }: RefinePanelProps) {
  const [open, setOpen] = useState(!!sectionId);
  const [sourceType, setSourceType] = useState<"url" | "text" | "file" | "saved">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [fileData, setFileData] = useState<{ name: string; base64: string; type: string } | null>(null);
  const [selectedSaved, setSelectedSaved] = useState<SavedSourceItem | null>(null);
  const [savedSources, setSavedSources] = useState<SavedSourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refinedSections, setRefinedSections] = useState<string[]>([]);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null);

  const loadSavedSources = () => {
    fetch("/api/learn/sources")
      .then((r) => (r.ok ? r.json() : { sources: [] }))
      .then((data) => setSavedSources(data.sources || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (open && savedSources.length === 0) {
      loadSavedSources();
    }
  }, [open, savedSources.length]);

  const handleRefine = async () => {
    if (loading) return;

    // Per-section refine mode: only needs instructions, no new source
    if (sectionId) {
      setLoading(true);
      setError(null);
      setStatusMessage(null);
      setRefinedSections([]);
      try {
        const res = await fetch(`/api/learn/guides/${guideId}/sections/${sectionId}/refine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instructions: instructions.trim() || undefined }),
        });
        if (res.ok) {
          setInstructions("");
          onRefined();
        } else {
          const errData = await res.json().catch(() => null);
          setError(errData?.error || "Section refinement failed.");
        }
      } catch (err) {
        console.error("Section refine failed:", err);
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Full guide refine mode: requires at least one source
    const sources = [];
    if (sourceType === "url" && url.trim()) {
      sources.push({ type: "url", url: url.trim() });
    } else if (sourceType === "text" && text.trim()) {
      sources.push({ type: "text", content: text.trim() });
    } else if (sourceType === "file" && fileData) {
      sources.push({ type: fileData.type, content: fileData.base64, encoding: "base64", filename: fileData.name });
    } else if (sourceType === "saved" && selectedSaved) {
      sources.push({ type: "saved", savedSourceId: selectedSaved.id });
    }
    if (sources.length === 0) return;

    setLoading(true);
    setError(null);
    setStatusMessage(null);
    setRefinedSections([]);
    try {
      const res = await fetch(`/api/learn/guides/${guideId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources, instructions: instructions.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "noop") {
          setStatusMessage(data.message || "No relevant sections matched this source.");
          return;
        }
        setUrl("");
        setText("");
        setFileData(null);
        setSelectedSaved(null);
        setInstructions("");
        // Refine now runs in background — notify parent to start polling
        if (data.relevantSections?.length > 0) {
          setRefinedSections(data.relevantSections);
        }
        onRefined();
      } else {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || "Refinement failed. Please try again.");
      }
    } catch (err) {
      console.error("Refine failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const refreshSavedSource = async (savedSourceId: string) => {
    setRefreshingSourceId(savedSourceId);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/learn/sources/${savedSourceId}/refresh`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || "Failed to refresh saved source.");
        return;
      }
      const refreshed = await res.json();
      loadSavedSources();
      if (selectedSaved?.id === savedSourceId) {
        setSelectedSaved(refreshed);
      }
    } catch (err) {
      console.error("Saved source refresh failed:", err);
      setError("Failed to refresh saved source.");
    } finally {
      setRefreshingSourceId(null);
    }
  };

  return (
    <div className="border border-border rounded bg-card">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="label-mono text-muted-foreground group-hover:text-foreground transition-colors">
            {sectionId ? `Refine: ${sectionTitle}` : "Sources & Refinement"}
          </span>
        </div>
        {!sectionId && (
          <span className="label-mono text-muted-foreground/60">{existingSources.length} source{existingSources.length !== 1 ? "s" : ""}</span>
        )}
      </button>

      {/* Expandable content */}
      {open && sectionId && (
        <div className="px-5 pb-5 border-t border-border anim-fade-up">
          <div className="pt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Refine this section using all existing guide sources. Optionally add instructions:
            </p>
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. 'add more code examples', 'cover distributed consensus'"
              className="w-full bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            <button
              onClick={handleRefine}
              disabled={loading}
              data-slot="button"
              className="mt-3 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-1">
                  Refining section<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
                </span>
              ) : "Refine Section"}
            </button>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
        </div>
      )}

      {/* Full-guide refine mode */}
      {open && !sectionId && (
        <div className="px-5 pb-5 border-t border-border anim-fade-up">
          {/* Existing sources list */}
          {existingSources.length > 0 && (
            <div className="py-3 space-y-2">
              {existingSources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="label-mono bg-muted px-1.5 py-0.5 rounded">{s.type}</span>
                  <span className="truncate text-xs">{s.title || s.url || "Text input"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add new source */}
          <div className="pt-3 border-t border-border">
            <div className="label-mono text-muted-foreground mb-3">Add New Source</div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSourceType("url")}
                className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                  sourceType === "url"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Link2 className="w-3 h-3" /> URL
              </button>
              <button
                onClick={() => setSourceType("text")}
                className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                  sourceType === "text"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="w-3 h-3" /> Text
              </button>
              <button
                onClick={() => setSourceType("file")}
                className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                  sourceType === "file"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload className="w-3 h-3" /> File
              </button>
              {savedSources.length > 0 && (
                <button
                  onClick={() => setSourceType("saved")}
                  className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                    sourceType === "saved"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BookmarkCheck className="w-3 h-3" /> Saved ({savedSources.length})
                </button>
              )}
            </div>
            {sourceType === "url" && (
              <div>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste article URL (Substack, Medium, blog, docs)..."
                  className="w-full bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                  Substack and Medium member articles supported with configured credentials
                </p>
              </div>
            )}
            {sourceType === "text" && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste text content..."
                rows={3}
                className="w-full bg-background border border-input rounded px-3 py-2.5 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            )}
            {sourceType === "file" && (
              <div>
                <FileDropZone
                  onFile={(f) => setFileData(f)}
                  disabled={loading}
                />
                {fileData && (
                  <div className="label-mono text-muted-foreground mt-2">
                    Selected: {fileData.name}
                  </div>
                )}
              </div>
            )}
            {sourceType === "saved" && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {savedSources.map((s) => (
                  <div
                    key={s.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-sm transition-all ${
                      selectedSaved?.id === s.id
                        ? "bg-primary/10 border border-primary"
                        : "bg-background border border-input hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    <button
                      onClick={() => setSelectedSaved(s)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <BookmarkCheck className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{s.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.type} &middot; {new URL(s.url).hostname.replace("www.", "")}
                          {s.captureMethod === "dom_fallback" ? " · needs refresh" : ""}
                        </div>
                      </div>
                    </button>
                    {s.refreshable && (
                      <button
                        onClick={() => refreshSavedSource(s.id)}
                        disabled={refreshingSourceId === s.id}
                        className="shrink-0 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                        title="Refresh saved source"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshingSourceId === s.id ? "animate-spin" : ""}`} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Optional instructions */}
            {!sectionId && (
              <input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional: focus areas (e.g. 'add more code examples', 'cover edge cases')"
                className="mt-2 w-full bg-background border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            )}
            <button
              onClick={handleRefine}
              disabled={loading || (!sectionId && (
                sourceType === "url" ? !url.trim() :
                sourceType === "text" ? !text.trim() :
                sourceType === "saved" ? !selectedSaved :
                !fileData
              ))}
              data-slot="button"
              className="mt-3 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-1">
                  {sectionId ? "Refining section" : "Analyzing sources"}<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
                </span>
              ) : sectionId ? "Refine Section" : "Refine with Source"}
            </button>
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
            {statusMessage && (
              <p className="text-sm text-muted-foreground mt-2">{statusMessage}</p>
            )}
            {refinedSections.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Refined {refinedSections.length} section{refinedSections.length > 1 ? "s" : ""}:</p>
                <div className="flex gap-1.5 flex-wrap">
                  {refinedSections.map((id) => (
                    <span key={id} className="label-mono px-2 py-0.5 rounded bg-chart-3/20 text-chart-3">
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
