"use client";

import { useState } from "react";

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
}

export function RefinePanel({ guideId, existingSources, onRefined }: RefinePanelProps) {
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRefine = async () => {
    if (loading) return;
    const sources = [];
    if (sourceType === "url" && url.trim()) {
      sources.push({ type: "url", url: url.trim() });
    } else if (sourceType === "text" && text.trim()) {
      sources.push({ type: "text", content: text.trim() });
    }
    if (sources.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/learn/guides/${guideId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      if (res.ok) {
        setUrl("");
        setText("");
        setOpen(false);
        onRefined();
      }
    } catch (err) {
      console.error("Refine failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium">Sources &amp; Refinement</span>
        <span className="text-xs text-muted-foreground">{existingSources.length} source{existingSources.length !== 1 ? "s" : ""}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {existingSources.length > 0 && (
            <div className="space-y-1">
              {existingSources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono uppercase bg-muted px-1.5 py-0.5 rounded">{s.type}</span>
                  <span className="truncate">{s.title || s.url || "Text input"}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            <div className="text-xs font-medium mb-2">Add New Source</div>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setSourceType("url")}
                className={`text-xs px-2 py-1 rounded ${sourceType === "url" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                URL
              </button>
              <button
                onClick={() => setSourceType("text")}
                className={`text-xs px-2 py-1 rounded ${sourceType === "text" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                Text
              </button>
            </div>
            {sourceType === "url" ? (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste article URL (Substack, Medium, blog, etc.)..."
                className="w-full bg-muted border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste text content..."
                rows={3}
                className="w-full bg-muted border rounded px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <button
              onClick={handleRefine}
              disabled={loading || (sourceType === "url" ? !url.trim() : !text.trim())}
              className="mt-2 bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Refining guide..." : "Refine with Source"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
