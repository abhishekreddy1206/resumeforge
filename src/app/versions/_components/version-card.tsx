"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  TrendingUp,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ProfileDiffView } from "@/components/diff-view";
import {
  computeDetailedDiff,
  normalizeSnapshotForDiff,
} from "@/lib/utils/profile-diff";
import { monoStyle, ProgressBar } from "./shared";

export interface VersionResume {
  id: string;
  format: string;
  createdAt: string | Date;
}

export interface VersionData {
  id: string;
  score: number;
  scoreVersion: number | null;
  delta: number | null;
  label: string | null;
  createdAt: string | Date;
  snapshot: Record<string, unknown> | null;
  optimizationPlan: Record<string, unknown> | null;
  resumeData: Record<string, unknown> | null;
  parseError: boolean;
  resumes: VersionResume[];
}

type FormatOption = "pdf" | "docx";

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function VersionCard({
  version,
  prev,
  versionNumber,
  onDelete,
  onGenerate,
  deleting,
  generating,
}: {
  version: VersionData;
  prev: VersionData | null;
  versionNumber: number;
  onDelete: (id: string) => void;
  onGenerate: (version: VersionData, fmt: FormatOption) => void;
  deleting: boolean;
  generating: boolean;
}) {
  const [previewResumeId, setPreviewResumeId] = useState<string | null>(null);
  const isInitial = prev === null;

  const diffs =
    !isInitial && version.snapshot && prev.snapshot && !version.parseError && !prev.parseError
      ? computeDetailedDiff(
          normalizeSnapshotForDiff(prev.snapshot),
          normalizeSnapshotForDiff(version.snapshot)
        )
      : [];

  const copyLabel = async () => {
    if (!version.label) return;
    try {
      await navigator.clipboard.writeText(version.label);
      toast.success("Label copied");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="border border-border rounded-md bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3">
        <div className="w-10 h-10 flex flex-col items-center justify-center shrink-0 border border-border rounded-sm bg-background">
          <span className="text-base font-bold text-primary leading-none">
            {Math.round(version.score)}
          </span>
          <span className="text-[8px] text-muted-foreground leading-none mt-0.5">
            score
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">v{versionNumber}</p>
            <Badge variant="outline" className="text-[9px] px-1 py-0 rounded-sm">
              {version.scoreVersion === 2 ? "Quality" : "Legacy"}
            </Badge>
            {version.delta != null && version.delta > 0 && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1 py-0 rounded-sm gap-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              >
                <TrendingUp className="w-2 h-2" />+{Math.round(version.delta)}
              </Badge>
            )}
            {version.delta != null && version.delta < 0 && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1 py-0 rounded-sm bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
              >
                {Math.round(version.delta)}
              </Badge>
            )}
            {version.resumes.length > 0 && (
              <div className="flex gap-0.5">
                {version.resumes.map((r) => (
                  <Badge
                    key={r.id}
                    variant="outline"
                    className="text-[8px] px-1 py-0 rounded-sm"
                  >
                    {r.format.toUpperCase()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {version.label && (
            <button
              onClick={copyLabel}
              className="text-[11px] text-muted-foreground truncate text-left hover:text-foreground transition-colors"
              title="Click to copy"
            >
              {version.label}
            </button>
          )}
          <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.5rem" }}>
            {formatDate(version.createdAt)}
          </p>
        </div>

        <div className="shrink-0 w-40 hidden sm:block">
          <ProgressBar value={version.score} label={`${Math.round(version.score)}%`} />
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">
        {version.parseError && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              Snapshot data couldn&apos;t be parsed — diff is unavailable for this
              version.
            </div>
          </div>
        )}

        {/* Changes */}
        <div>
          <p className="text-muted-foreground mb-2" style={monoStyle}>
            Changes
          </p>
          {isInitial ? (
            <p className="text-xs text-muted-foreground italic">
              Initial version — no prior snapshot to compare.
            </p>
          ) : version.parseError || !version.snapshot || !prev.snapshot ? (
            <p className="text-xs text-muted-foreground italic">
              Can&apos;t compute diff for this version.
            </p>
          ) : (
            <ProfileDiffView diffs={diffs} accentColor="emerald" />
          )}
        </div>

        {/* Generate buttons */}
        <div>
          <p className="text-muted-foreground mb-2" style={monoStyle}>
            Generate Resume
          </p>
          <div className="flex gap-2">
            {(["pdf", "docx"] as FormatOption[]).map((fmt) => (
              <Button
                key={fmt}
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-sm text-xs flex-1"
                disabled={generating}
                onClick={() => onGenerate(version, fmt)}
              >
                {generating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {fmt.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        {/* Resumes */}
        {version.resumes.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1.5" style={monoStyle}>
              Generated Resumes
            </p>
            <div className="space-y-1">
              {version.resumes.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between py-1.5 px-2.5 border rounded-sm transition-colors ${
                    previewResumeId === r.id
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs">{r.format.toUpperCase()}</span>
                    <span
                      className="text-muted-foreground"
                      style={{ ...monoStyle, fontSize: "0.5rem" }}
                    >
                      {new Date(r.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.format === "pdf" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 gap-1 text-[10px]"
                        onClick={() =>
                          setPreviewResumeId(previewResumeId === r.id ? null : r.id)
                        }
                      >
                        <Eye className="w-2.5 h-2.5" />
                        {previewResumeId === r.id ? "Hide" : "Preview"}
                      </Button>
                    )}
                    <a
                      href={`/api/resume/download/${r.id}`}
                      download
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Download className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PDF Preview */}
        {previewResumeId && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted-foreground" style={monoStyle}>
                PDF Preview
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setPreviewResumeId(null)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="border border-border rounded-sm overflow-hidden bg-card">
              <iframe
                src={`/api/resume/download/${previewResumeId}?inline=1`}
                className="w-full border-0"
                style={{ height: "70vh", minHeight: "300px" }}
                title="Resume PDF Preview"
              />
            </div>
          </div>
        )}

        {/* Delete */}
        <div className="pt-1 border-t border-border/60">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-destructive hover:text-destructive h-7"
            onClick={() => onDelete(version.id)}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Delete Version
          </Button>
        </div>
      </div>
    </div>
  );
}
