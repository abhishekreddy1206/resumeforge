"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, History, Briefcase, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  VersionCard,
  type VersionData,
  type VersionResume,
} from "../_components/version-card";
import { monoStyle } from "../_components/shared";

interface JobInfo {
  id: string;
  title: string;
  company: string;
  url: string | null;
  applied: boolean;
}

interface ApiResponse {
  job: JobInfo;
  versions: Array<{
    id: string;
    score: number;
    scoreVersion: number | null;
    delta: number | null;
    label: string | null;
    createdAt: string;
    snapshot: Record<string, unknown> | null;
    optimizationPlan: Record<string, unknown> | null;
    resumeData: Record<string, unknown> | null;
    parseError: boolean;
    resumes: Array<{
      id: string;
      format: string;
      createdAt: string;
      evaluationStatus: string | null;
      evaluationVersion: number | null;
    }>;
  }>;
}

const INITIALLY_VISIBLE = 3;

export default function JobVersionsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [versions, setVersions] = useState<VersionData[]>([]);
  const [showOlder, setShowOlder] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profile/versions/by-job/${jobId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = (await res.json()) as ApiResponse;
      setJob(data.job);
      setVersions(
        data.versions.map((v) => ({
          id: v.id,
          score: v.score,
          scoreVersion: v.scoreVersion,
          delta: v.delta,
          label: v.label,
          createdAt: v.createdAt,
          snapshot: v.snapshot,
          optimizationPlan: v.optimizationPlan,
          resumeData: v.resumeData,
          parseError: v.parseError,
          resumes: v.resumes as VersionResume[],
        }))
      );
    } catch (err) {
      toast.error(
        `Failed to load versions: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this version? Generated resumes will be orphaned.")) {
        return;
      }
      setDeletingId(id);
      try {
        const res = await fetch(`/api/profile/versions/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.success("Version deleted");
        await load();
      } catch {
        toast.error("Failed to delete version");
      } finally {
        setDeletingId(null);
      }
    },
    [load]
  );

  const handleGenerate = useCallback(
    async (version: VersionData, format: "pdf" | "docx") => {
      if (!job) return;
      setGeneratingFor(version.id);
      try {
        const res = await fetch("/api/resume/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: job.id,
            format,
            profileOverride: version.snapshot,
            profileVersionId: version.id,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Generation failed");
        }
        toast.success(`${format.toUpperCase()} resume generated`);
        await load();
      } catch (err) {
        toast.error(
          `Generation failed: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      } finally {
        setGeneratingFor(null);
      }
    },
    [job, load]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="py-16 text-center space-y-4">
        <History className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Job not found.</p>
        <Link href="/versions">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3 h-3 mr-1.5" />
            Back to Versions
          </Button>
        </Link>
      </div>
    );
  }

  const visibleVersions = showOlder
    ? versions
    : versions.slice(0, INITIALLY_VISIBLE);
  const hiddenCount = Math.max(0, versions.length - INITIALLY_VISIBLE);

  // versions are newest-first; the "previous" snapshot for version[i] is version[i+1]
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link
          href="/versions"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          All Versions
        </Link>

        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p
              className="text-muted-foreground mb-2 flex items-center gap-1.5"
              style={monoStyle}
            >
              <Briefcase className="w-3 h-3" />
              Version history
            </p>
            <h1
              className="text-foreground leading-tight"
              style={{
                fontFamily: "var(--font-cormorant)",
                fontStyle: "italic",
                fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                fontWeight: 400,
              }}
            >
              {job.title}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-sm text-muted-foreground">{job.company}</p>
              {job.applied && (
                <Badge
                  variant="secondary"
                  className="text-[9px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Applied
                </Badge>
              )}
            </div>
          </div>

          <div className="text-right">
            <p className="text-muted-foreground" style={monoStyle}>
              {versions.length} {versions.length === 1 ? "version" : "versions"}
            </p>
            {versions[0] && (
              <p className="text-xs text-muted-foreground mt-1">
                Latest: {Math.round(versions[0].score)}%
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Versions list */}
      {versions.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-md">
          <History className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No saved resume versions for this job yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleVersions.map((version, i) => {
            const absoluteIndex = i;
            const prev = versions[absoluteIndex + 1] ?? null;
            const versionNumber = versions.length - absoluteIndex;
            return (
              <VersionCard
                key={version.id}
                version={version}
                prev={prev}
                versionNumber={versionNumber}
                onDelete={handleDelete}
                onGenerate={handleGenerate}
                deleting={deletingId === version.id}
                generating={generatingFor === version.id}
              />
            );
          })}

          {hiddenCount > 0 && !showOlder && (
            <button
              onClick={() => setShowOlder(true)}
              className="w-full py-3 border border-dashed border-border rounded-md text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Show {hiddenCount} older {hiddenCount === 1 ? "version" : "versions"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
