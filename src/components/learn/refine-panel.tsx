"use client";

import { useState } from "react";
import { ChevronRight, Link2, FileText, Upload } from "lucide-react";
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
}

export function RefinePanel({ guideId, existingSources, onRefined }: RefinePanelProps) {
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"url" | "text" | "file">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fileData, setFileData] = useState<{ name: string; base64: string; type: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRefine = async () => {
    if (loading) return;
    const sources = [];
    if (sourceType === "url" && url.trim()) {
      sources.push({ type: "url", url: url.trim() });
    } else if (sourceType === "text" && text.trim()) {
      sources.push({ type: "text", content: text.trim() });
    } else if (sourceType === "file" && fileData) {
      sources.push({ type: fileData.type, content: fileData.base64, encoding: "base64", filename: fileData.name });
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
        setFileData(null);
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
    <div className="border border-border rounded bg-card">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="label-mono text-muted-foreground group-hover:text-foreground transition-colors">Sources & Refinement</span>
        </div>
        <span className="label-mono text-muted-foreground/60">{existingSources.length} source{existingSources.length !== 1 ? "s" : ""}</span>
      </button>

      {/* Expandable content */}
      {open && (
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
            </div>
            {sourceType === "url" && (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste article URL (Substack, Medium, blog, docs)..."
                className="w-full bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
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
            <button
              onClick={handleRefine}
              disabled={loading || (
                sourceType === "url" ? !url.trim() :
                sourceType === "text" ? !text.trim() :
                !fileData
              )}
              data-slot="button"
              className="mt-3 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-1">
                  Refining<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
                </span>
              ) : "Refine with Source"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
