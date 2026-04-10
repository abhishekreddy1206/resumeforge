"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Sparkles, ArrowRight } from "lucide-react";
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
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPathTitle, setNewPathTitle] = useState("");
  const [showNewPath, setShowNewPath] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch("/api/learn/guides").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/learn/paths").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/learn/recommendations").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([g, p, rec]) => {
        setGuides(g);
        setPaths(p);
        setRecommendations(Array.isArray(rec) ? rec : []);
      })
      .finally(() => setLoading(false));
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
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> Learn
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Interactive study guides for technical interview preparation</p>
      </div>

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <section className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">Recommended Based on Your Skill Gaps</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {recommendations.slice(0, 3).map((rec, i) => (
              <div key={i} className="bg-card border rounded-lg p-3">
                <div className="text-xs text-red-500 mb-1">{rec.frequency} jobs mention this</div>
                <div className="text-sm font-semibold mb-1">{rec.topic}</div>
                <div className="text-xs text-muted-foreground mb-2">{rec.description}</div>
                <button
                  onClick={() => handleCreate(rec.topic)}
                  disabled={creating}
                  className="text-xs bg-violet-500 text-white px-3 py-1 rounded hover:bg-violet-600 disabled:opacity-50 transition-colors"
                >
                  Generate Guide
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create New Guide */}
      <section className="bg-card border border-dashed rounded-lg p-6 text-center">
        <div className="text-sm text-foreground mb-2">Create a New Guide</div>
        <div className="flex gap-2 max-w-lg mx-auto">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate(topic)}
            placeholder="Enter a topic (e.g., 'B-trees', 'Raft consensus')..."
            className="flex-1 bg-muted border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={creating}
          />
          <button
            onClick={() => handleCreate(topic)}
            disabled={!topic.trim() || creating}
            className="bg-foreground text-background px-4 py-2 rounded text-sm font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-colors"
          >
            {creating ? "Generating..." : "Generate"}
          </button>
        </div>
      </section>

      {/* Learning Paths */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Learning Paths</h2>
          <button onClick={() => setShowNewPath(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" /> Create Path
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {paths.map((path) => (
            <div key={path.id} className="bg-card border rounded-lg p-4">
              <div className="text-sm font-semibold mb-1">{path.title}</div>
              <div className="text-xs text-muted-foreground mb-2">{path.guideCount} guides · {path.completedCount} completed</div>
              <div className="bg-muted rounded h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${path.progress >= 100 ? "bg-green-500" : path.progress > 0 ? "bg-amber-500" : "bg-muted-foreground/20"}`}
                  style={{ width: `${path.progress}%` }}
                />
              </div>
              <div className="text-xs mt-1" style={{ color: path.progress >= 100 ? "rgb(34 197 94)" : path.progress > 0 ? "rgb(245 158 11)" : undefined }}>
                {path.progress}% complete
              </div>
            </div>
          ))}
          {showNewPath && (
            <div className="bg-card border border-dashed rounded-lg p-4 flex flex-col gap-2">
              <input
                value={newPathTitle}
                onChange={(e) => setNewPathTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePath()}
                placeholder="Path title..."
                className="bg-muted border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleCreatePath} disabled={!newPathTitle.trim()} className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded disabled:opacity-50">
                  Create
                </button>
                <button onClick={() => { setShowNewPath(false); setNewPathTitle(""); }} className="text-xs text-muted-foreground">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {paths.length === 0 && !showNewPath && (
            <div className="bg-card border border-dashed rounded-lg p-4 flex items-center justify-center text-sm text-muted-foreground cursor-pointer hover:bg-muted/50" onClick={() => setShowNewPath(true)}>
              <Plus className="w-4 h-4 mr-1" /> New Path
            </div>
          )}
        </div>
      </section>

      {/* All Guides */}
      <section>
        <h2 className="text-lg font-semibold mb-3">All Guides</h2>
        {guides.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No guides yet. Create your first guide above or generate one from a recommendation.
          </div>
        ) : (
          <div className="space-y-2">
            {guides.map((guide) => (
              <a key={guide.id} href={`/learn/${guide.slug}`} className="block bg-card border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{guide.topic}</div>
                    <div className="text-xs text-muted-foreground">
                      v{guide.version} · {guide.sourceCount} source{guide.sourceCount !== 1 ? "s" : ""} · Updated {new Date(guide.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${
                      guide.completionStatus === "completed" ? "text-green-500" :
                      guide.completionStatus === "in_progress" ? "text-amber-500" : "text-muted-foreground"
                    }`}>
                      {guide.completionStatus === "completed" ? "Completed" :
                       guide.completionStatus === "in_progress" ? "In Progress" : "Not Started"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
