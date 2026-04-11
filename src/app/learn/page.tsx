"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Sparkles, ArrowRight, ChevronRight } from "lucide-react";
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
      const res = await fetch("/api/learn/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicText.trim() }),
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

      {/* AI Recommendations — loads independently from the rest of the page */}
      {recsLoading ? (
        <section className="anim-fade-up-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="label-mono text-muted-foreground">
              Analyzing your skill gaps<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
            </span>
          </div>
        </section>
      ) : recommendations.length > 0 ? (
        <section className="anim-fade-up-1">
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

      {/* Create New Guide — editorial input */}
      <section className="anim-fade-up-2">
        <div className="border border-dashed border-border rounded bg-card/50 px-6 py-8">
          <div className="max-w-lg mx-auto">
            <div className="label-mono text-muted-foreground mb-3 text-center">New Study Guide</div>
            <div className="flex gap-2">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate(topic)}
                placeholder="Enter a topic — B-trees, Raft consensus, system design..."
                className="flex-1 bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                style={{ fontFamily: "var(--font-geist-sans)" }}
                disabled={creating}
              />
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
            </div>
          </div>
        </div>
      </section>

      {/* Learning Paths */}
      <section className="anim-fade-up-3">
        <div className="flex items-center justify-between mb-4">
          <span className="label-mono text-muted-foreground">Learning Paths</span>
          <button onClick={() => setShowNewPath(true)} className="label-mono text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
            <Plus className="w-3 h-3" /> Create Path
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {paths.map((path) => (
            <div key={path.id} className="bg-card border border-border rounded p-4 card-hover">
              <div
                className="text-base font-medium mb-1"
                style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
              >
                {path.title}
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
            </div>
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
      <section className="anim-fade-up-4">
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
    </div>
  );
}
