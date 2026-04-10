"use client";

import { useEffect, useState, useCallback, use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GuideRenderer } from "@/components/learn/guide-renderer";
import { RefinePanel } from "@/components/learn/refine-panel";
import { ArrowLeft } from "lucide-react";
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

  const fetchGuide = useCallback(async () => {
    try {
      // First get the guide ID from slug by listing all guides
      const listRes = await fetch("/api/learn/guides");
      if (!listRes.ok) { setError("Failed to load guides"); return; }
      const guides = await listRes.json();
      const match = guides.find((g: { slug: string }) => g.slug === slug);
      if (!match) { setError("Guide not found"); return; }

      const res = await fetch(`/api/learn/guides/${match.id}`);
      if (!res.ok) { setError("Failed to load guide"); return; }
      setGuide(await res.json());
    } catch {
      setError("Failed to load guide");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchGuide(); }, [fetchGuide]);

  const handleProgressUpdate = useCallback(async (progress: Record<string, { quizzesCompleted: number[]; scenariosRevealed: number[] }>) => {
    if (!guide) return;

    // Determine completion status
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
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground">{error || "Guide not found"}</p>
        <a href="/learn" className="text-primary text-sm hover:underline mt-2 inline-block">Back to Learn</a>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <a href="/learn" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Learn
        </a>
        <div className="text-xs text-muted-foreground">v{guide.version}</div>
      </div>

      {/* Guide content */}
      <GuideRenderer
        guideId={guide.id}
        content={guide.content}
        initialProgress={guide.sectionProgress}
        onProgressUpdate={handleProgressUpdate}
      />

      {/* Refine panel */}
      <div className="mt-12">
        <RefinePanel
          guideId={guide.id}
          existingSources={guide.sources}
          onRefined={() => fetchGuide()}
        />
      </div>
    </div>
  );
}
