"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Sparkles, ArrowRight, ChevronRight, Link2, FileText, X, Upload } from "lucide-react";
import { FileDropZone } from "@/components/learn/file-drop-zone";
import { KnowledgeGraph } from "@/components/learn/knowledge-graph";
import type { GuideRecommendation } from "@/lib/claude/skills/guide-recommender";

interface GuideListItem {
  id: string;
  topic: string;
  slug: string;
  version: number;
  status: string;
  category: string | null;
  tags: string[];
  completionStatus: string;
  sourceCount: number;
  versionCount: number;
  updatedAt: string;
}

interface LearningPathItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  guideCount: number;
  completedCount: number;
  progress: number;
}

interface SourceItem {
  id: string;
  type: "url" | "text" | "pdf" | "docx";
  url?: string;
  content?: string;
  filename?: string;
  label: string;
}

let sourceIdCounter = 0;

export default function LearnPage() {
  const [guides, setGuides] = useState<GuideListItem[]>([]);
  const [paths, setPaths] = useState<LearningPathItem[]>([]);
  const [recommendations, setRecommendations] = useState<GuideRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPathTitle, setNewPathTitle] = useState("");
  const [showNewPath, setShowNewPath] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceTab, setSourceTab] = useState<"url" | "text" | "file">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");

  const fetchData = () => {
    // Fast: guides + paths (~9ms) — unblocks page immediately
    Promise.all([
      fetch("/api/learn/guides").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/learn/paths").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([g, p]) => { setGuides(g); setPaths(p); })
      .finally(() => setLoading(false));

    // Slow: recommendations (5-30s) — loads independently in background
    fetch("/api/learn/recommendations")
      .then((r) => (r.ok ? r.json() : []))
      .then((rec) => setRecommendations(Array.isArray(rec) ? rec : []))
      .catch(() => setRecommendations([]))
      .finally(() => setRecsLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (topicText: string) => {
    if (!topicText.trim() || creating) return;
    setCreating(true);
    try {
      const payload: Record<string, unknown> = { topic: topicText.trim() };
      if (sources.length > 0) {
        payload.sources = sources.map((s) => {
          if (s.type === "url") return { type: "url", url: s.url };
          if (s.type === "text") return { type: "text", content: s.content };
          return { type: s.type, content: s.content, encoding: "base64", filename: s.filename };
        });
      }
      const res = await fetch("/api/learn/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = `/learn/${data.slug}`;
      }
    } catch (err) {
      console.error("Create guide failed:", err);
    } finally {
      setCreating(false);
    }
  };

  const addUrlSource = () => {
    const trimmed = sourceUrl.trim();
    if (!trimmed) return;
    try {
      const hostname = new URL(trimmed).hostname.replace("www.", "");
      setSources((prev) => [...prev, { id: String(++sourceIdCounter), type: "url", url: trimmed, label: hostname }]);
      setSourceUrl("");
    } catch {
      setSources((prev) => [...prev, { id: String(++sourceIdCounter), type: "url", url: trimmed, label: trimmed.slice(0, 30) }]);
      setSourceUrl("");
    }
  };

  const addTextSource = () => {
    const trimmed = sourceText.trim();
    if (!trimmed) return;
    setSources((prev) => [...prev, {
      id: String(++sourceIdCounter),
      type: "text",
      content: trimmed,
      label: trimmed.slice(0, 40) + (trimmed.length > 40 ? "..." : ""),
    }]);
    setSourceText("");
  };

  const addFileSource = (file: { name: string; base64: string; type: string }) => {
    setSources((prev) => [...prev, {
      id: String(++sourceIdCounter),
      type: file.type as "pdf" | "docx",
      content: file.base64,
      filename: file.name,
      label: file.name,
    }]);
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleCreatePath = async () => {
    if (!newPathTitle.trim()) return;
    try {
      await fetch("/api/learn/paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newPathTitle.trim() }),
      });
      setNewPathTitle("");
      setShowNewPath(false);
      fetchData();
    } catch (err) {
      console.error("Create path failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-32 rounded-lg skeleton-shimmer" />
        <Skeleton className="h-20 rounded-lg skeleton-shimmer" />
        <Skeleton className="h-48 rounded-lg skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-12">
      {/* Header — editorial masthead */}
      <div className="anim-fade-up">
        <h1
          className="text-3xl sm:text-4xl tracking-tight text-gradient"
          style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 500 }}
        >
          Learn
        </h1>
        <p className="text-sm text-muted-foreground mt-2" style={{ fontFamily: "var(--font-geist-sans)", maxWidth: "32rem" }}>
          AI-generated study guides for the technical topics that matter to your job search.
          Interactive quizzes, code deep-dives, and interview scenarios.
        </p>
        <div className="section-divider mt-4" />
      </div>

      {/* Create New Guide — editorial input */}
      <section className="anim-fade-up-1">
        <div className="border border-dashed border-border rounded bg-card/50 px-6 py-8">
          <div className="max-w-lg mx-auto">
            <div className="label-mono text-muted-foreground mb-3 text-center">New Study Guide</div>
            <div className="flex gap-2">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !showSources && handleCreate(topic)}
                placeholder="Enter a topic — B-trees, Raft consensus, system design..."
                className="flex-1 bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                style={{ fontFamily: "var(--font-geist-sans)" }}
                disabled={creating}
              />
              {!showSources && (
                <button
                  onClick={() => handleCreate(topic)}
                  disabled={!topic.trim() || creating}
                  data-slot="button"
                  className="bg-primary text-primary-foreground px-5 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all"
                >
                  {creating ? (
                    <span className="flex items-center gap-1">
                      Generating<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
                    </span>
                  ) : "Generate"}
                </button>
              )}
            </div>

            {/* Toggle */}
            {!creating && (
              <button
                onClick={() => setShowSources(!showSources)}
                className="label-mono text-primary hover:text-primary/80 mt-3 flex items-center gap-1 transition-colors"
              >
                <Plus className={`w-3 h-3 transition-transform ${showSources ? "rotate-45" : ""}`} />
                {showSources ? "Hide Sources" : "Add Sources"}
              </button>
            )}

            {/* Expandable source panel */}
            {showSources && !creating && (
              <div className="mt-4 space-y-4 anim-fade-up">
                {/* Tabs */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSourceTab("url")}
                    className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                      sourceTab === "url"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Link2 className="w-3 h-3" /> URL
                  </button>
                  <button
                    onClick={() => setSourceTab("text")}
                    className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                      sourceTab === "text"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileText className="w-3 h-3" /> Text
                  </button>
                  <button
                    onClick={() => setSourceTab("file")}
                    className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                      sourceTab === "file"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Upload className="w-3 h-3" /> File
                  </button>
                </div>

                {/* Tab content */}
                {sourceTab === "url" && (
                  <div className="flex gap-2">
                    <input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addUrlSource()}
                      placeholder="Paste article URL (Medium, Substack, blog, docs)..."
                      className="flex-1 bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                    <button
                      onClick={addUrlSource}
                      disabled={!sourceUrl.trim()}
                      data-slot="button"
                      className="bg-muted text-foreground px-3 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all"
                    >
                      Add
                    </button>
                  </div>
                )}
                {sourceTab === "text" && (
                  <div className="space-y-2">
                    <textarea
                      value={sourceText}
                      onChange={(e) => setSourceText(e.target.value)}
                      placeholder="Paste text content..."
                      rows={3}
                      className="w-full bg-background border border-input rounded px-3 py-2.5 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                    <button
                      onClick={addTextSource}
                      disabled={!sourceText.trim()}
                      data-slot="button"
                      className="bg-muted text-foreground px-3 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all"
                    >
                      Add
                    </button>
                  </div>
                )}
                {sourceTab === "file" && (
                  <FileDropZone onFile={addFileSource} />
                )}
              </div>
            )}

            {/* Source chips */}
            {sources.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {sources.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 bg-muted rounded px-2.5 py-1 text-xs anim-fade-up"
                    style={{ fontFamily: "var(--font-geist-sans)" }}
                  >
                    {s.type === "url" ? <Link2 className="w-3 h-3 text-muted-foreground shrink-0" /> :
                     (s.type === "pdf" || s.type === "docx") ? <Upload className="w-3 h-3 text-muted-foreground shrink-0" /> :
                     <FileText className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="truncate max-w-[200px]">{s.label}</span>
                    <button
                      onClick={() => removeSource(s.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Generate button when sources panel is open */}
            {showSources && (
              <button
                onClick={() => handleCreate(topic)}
                disabled={!topic.trim() || creating}
                data-slot="button"
                className="mt-4 bg-primary text-primary-foreground px-5 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all w-full"
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-1">
                    Generating from {sources.length} source{sources.length !== 1 ? "s" : ""}<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
                  </span>
                ) : (
                  sources.length > 0
                    ? `Generate from ${sources.length} source${sources.length !== 1 ? "s" : ""}`
                    : "Generate"
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Learning Paths */}
      <section className="anim-fade-up-2">
        <div className="flex items-center justify-between mb-4">
          <span className="label-mono text-muted-foreground">Learning Paths</span>
          <button onClick={() => setShowNewPath(true)} className="label-mono text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
            <Plus className="w-3 h-3" /> Create Path
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {paths.map((path) => (
            <a key={path.id} href={`/learn/paths/${path.id}`} className="group bg-card border border-border rounded p-4 card-hover block">
              <div className="flex items-start justify-between mb-1">
                <div
                  className="text-base font-medium group-hover:text-primary transition-colors"
                  style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
                >
                  {path.title}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5 ml-2" />
              </div>
              <div className="label-mono text-muted-foreground mb-3">{path.guideCount} guides · {path.completedCount} done</div>
              <div className="bg-muted rounded-full h-1 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.max(path.progress, 2)}%`,
                    backgroundColor: path.progress >= 100
                      ? "oklch(0.55 0.15 150)"
                      : "var(--primary)",
                    opacity: path.progress === 0 ? 0.3 : 1,
                  }}
                />
              </div>
              <div className="label-mono mt-2" style={{
                color: path.progress >= 100 ? "oklch(0.55 0.15 150)" : "var(--muted-foreground)",
              }}>
                {path.progress}% complete
              </div>
            </a>
          ))}
          {showNewPath && (
            <div className="bg-card border border-dashed border-border rounded p-4 flex flex-col gap-3 anim-fade-up">
              <input
                value={newPathTitle}
                onChange={(e) => setNewPathTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePath()}
                placeholder="Path title..."
                className="bg-background border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreatePath}
                  disabled={!newPathTitle.trim()}
                  data-slot="button"
                  className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                >
                  Create
                </button>
                <button onClick={() => { setShowNewPath(false); setNewPathTitle(""); }} className="label-mono text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {paths.length === 0 && !showNewPath && (
            <div
              className="border border-dashed border-border rounded p-4 flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-card hover:border-primary/30 transition-all"
              onClick={() => setShowNewPath(true)}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span className="label-mono">New Path</span>
            </div>
          )}
        </div>
      </section>

      {/* All Guides */}
      <section className="anim-fade-up-3">
        <div className="flex items-center justify-between mb-4">
          <span className="label-mono text-muted-foreground">All Guides</span>
          <span className="label-mono text-muted-foreground/60">{guides.length} total</span>
        </div>
        {guides.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded">
            <p className="text-sm text-muted-foreground">No guides yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Create your first guide above or generate one from a recommendation.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {guides.map((guide, i) => (
              <a
                key={guide.id}
                href={`/learn/${guide.slug}`}
                className="group flex items-center justify-between py-3 px-4 rounded hover:bg-card border border-transparent hover:border-border transition-all"
                style={{ animationDelay: `${0.04 * i}s` }}
              >
                <div className="min-w-0">
                  <div
                    className="text-sm font-medium group-hover:text-primary transition-colors truncate"
                    style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600, fontSize: "1.05rem" }}
                  >
                    {guide.topic}
                  </div>
                  <div className="label-mono text-muted-foreground mt-0.5">
                    v{guide.version} · {guide.sourceCount} source{guide.sourceCount !== 1 ? "s" : ""} · {new Date(guide.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className={`label-mono ${
                    guide.completionStatus === "completed" ? "text-chart-3" :
                    guide.completionStatus === "in_progress" ? "text-primary" : "text-muted-foreground/40"
                  }`}>
                    {guide.completionStatus === "completed" ? "Done" :
                     guide.completionStatus === "in_progress" ? "In Progress" : "Not Started"}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Knowledge Map */}
      {guides.length >= 3 && (
        <section className="anim-fade-up-4">
          <div className="flex items-center justify-between mb-4">
            <span className="label-mono text-muted-foreground">Knowledge Map</span>
          </div>
          <div className="border border-border rounded bg-card p-4">
            <KnowledgeGraph />
          </div>
        </section>
      )}

      {/* AI Recommendations — loads independently from the rest of the page */}
      {recsLoading ? (
        <section>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="label-mono text-muted-foreground">
              Analyzing your skill gaps<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
            </span>
          </div>
        </section>
      ) : recommendations.length > 0 ? (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="label-mono text-primary">Recommended from your skill gaps</span>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {recommendations.slice(0, 3).map((rec, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded p-4 card-hover group cursor-pointer"
                style={{ animationDelay: `${0.08 * (i + 1)}s` }}
              >
                <div className="label-mono text-destructive mb-2">{rec.frequency} jobs mention this</div>
                <div
                  className="text-base font-medium mb-1 group-hover:text-primary transition-colors"
                  style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600, fontSize: "1.1rem" }}
                >
                  {rec.topic}
                </div>
                <div className="text-xs text-muted-foreground mb-3 leading-relaxed">{rec.description}</div>
                <button
                  onClick={() => handleCreate(rec.topic)}
                  disabled={creating}
                  className="label-mono text-primary hover:text-primary/80 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  Generate Guide <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
