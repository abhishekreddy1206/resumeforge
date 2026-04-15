"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/lib/hooks/use-scroll-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ExternalLink,
  Target,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Circle,
  Trophy,
  Loader2,
  Eye,
  Download,
  FileText,
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  company: string;
  url?: string;
  sponsorship?: string;
  applied: boolean;
  appliedAt?: string;
  matchResult?: string;
  createdAt: string;
  resumes: Array<{ id: string; format: string; createdAt: string }>;
  profileVersions?: Array<{
    id: string;
    score: number;
    delta: number | null;
    createdAt: string;
  }>;
}

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

function JobCard({ job, score, idx, togglingId, toggleApplied }: {
  job: Job; score: number; idx: number;
  togglingId: string | null;
  toggleApplied: (id: string, current: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "border border-border rounded-sm transition-colors hover:bg-accent/10 scroll-reveal",
        job.applied && "bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30"
      )}
      style={{ "--reveal-delay": `${idx * 0.05}s` } as React.CSSProperties}
    >
      <div className="p-4 sm:p-5 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-sm flex items-center justify-center shrink-0 bg-primary/8 text-primary font-bold"
          style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "1.1rem" }}
        >
          {(job.company || job.title)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{job.title}</span>
            <ScoreBadge score={score} />
            {job.sponsorship === "available" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                <ShieldCheck className="w-2.5 h-2.5" /> Sponsors
              </Badge>
            )}
            {job.sponsorship === "unavailable" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 font-semibold">
                <ShieldAlert className="w-2.5 h-2.5" /> No Sponsorship
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
            <span>{job.company}</span>
            {job.applied && job.appliedAt && (
              <span className="text-emerald-600 dark:text-emerald-400">
                · Applied {new Date(job.appliedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {job.resumes.length > 0 && (() => {
            const latest = job.resumes[0];
            const isPdf = latest.format === "pdf";
            return (
              <>
                {isPdf && (
                  <a href={`/api/resume/download/${latest.id}?inline=1`} target="_blank" rel="noopener noreferrer" className="inline-flex">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                      <Eye className="w-3 h-3" />
                      <span className="hidden sm:inline">View</span>
                    </Button>
                  </a>
                )}
                <a href={`/api/resume/download/${latest.id}`} download className="inline-flex">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                    <Download className="w-3 h-3" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </a>
                {job.resumes.length > 1 && (
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    <FileText className="w-2.5 h-2.5 inline mr-0.5" />
                    {job.resumes.length}
                  </span>
                )}
              </>
            );
          })()}
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                <ExternalLink className="w-3 h-3" />
                <span className="hidden sm:inline">Apply</span>
              </Button>
            </a>
          )}
          <Button
            variant={job.applied ? "default" : "outline"}
            size="sm"
            className={cn("gap-1.5 text-xs h-8", job.applied && "bg-emerald-600 hover:bg-emerald-700 text-white")}
            onClick={() => toggleApplied(job.id, job.applied)}
            disabled={togglingId === job.id}
          >
            {togglingId === job.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : job.applied ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">
              {job.applied ? "Applied" : "Mark Applied"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function getMatchScore(job: Job): number | null {
  if (job.matchResult) {
    try {
      const cached = JSON.parse(job.matchResult);
      if (cached?.overallScore) return cached.overallScore;
    } catch { /* ignore */ }
  }
  return null;
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
    >
      <Target className="w-3 h-3" />
      {score}%
    </span>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-border rounded-sm p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-sm" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-24 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TopMatchesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const listRef = useScrollReveal<HTMLDivElement>([jobs]);

  async function fetchJobs() {
    try {
      // Fetch all jobs (no pagination — top matches are a small subset)
      const res = await fetch("/api/jobs?page=1&pageSize=50");
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  async function toggleApplied(jobId: string, current: boolean) {
    setTogglingId(jobId);
    try {
      const res = await fetch("/api/jobs/applied", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, applied: !current }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, applied: !current, appliedAt: !current ? new Date().toISOString() : undefined }
            : j
        )
      );
      toast.success(!current ? "Marked as applied" : "Unmarked");
    } catch {
      toast.error("Failed to update applied status");
    } finally {
      setTogglingId(null);
    }
  }

  // All scored jobs (>= 75), split into active (last 30 days) and applied (any time)
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const allScoredJobs = jobs
    .map((job) => ({ job, score: getMatchScore(job) }))
    .filter((item): item is { job: Job; score: number } => item.score !== null && item.score >= 75)
    .sort((a, b) => new Date(b.job.createdAt).getTime() - new Date(a.job.createdAt).getTime());

  const activeJobs = allScoredJobs.filter(
    (t) => !t.job.applied && new Date(t.job.createdAt) >= oneMonthAgo
  );
  const appliedJobs = allScoredJobs.filter((t) => t.job.applied);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-0">
      {/* Header */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Top Matches · High-Scoring Positions
        </p>
        <h1
          className="text-foreground leading-tight mb-3"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: "clamp(2rem, 5vw, 3.2rem)",
            fontWeight: 300,
          }}
        >
          Your <span className="text-primary">Strongest</span> Matches
        </h1>
        <p className="text-muted-foreground max-w-lg leading-relaxed text-sm">
          Jobs where your profile scores above 75% — your best opportunities for a successful application.
        </p>
      </section>

      {activeJobs.length === 0 && appliedJobs.length === 0 ? (
        <section className="pt-16 pb-20 text-center anim-fade-up">
          <Trophy className="w-10 h-10 mx-auto text-muted-foreground/30 mb-4" />
          <p
            className="text-foreground mb-2"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "1.4rem",
              fontWeight: 400,
            }}
          >
            No top matches yet
          </p>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Add jobs and run match analysis to find positions where your profile scores above 75%.
          </p>
        </section>
      ) : (
        <section className="pt-8 anim-fade-up-2">
          <div className="flex items-center justify-between mb-5">
            <p className="text-muted-foreground" style={monoStyle}>
              {activeJobs.length} match{activeJobs.length !== 1 ? "es" : ""}
              {appliedJobs.length > 0 && ` · ${appliedJobs.length} applied`}
              {" · last 30 days"}
            </p>
          </div>

          {/* Active (non-applied) jobs */}
          <div className="space-y-2" ref={listRef}>
            {activeJobs.map(({ job, score }, idx) => (
              <JobCard key={job.id} job={job} score={score} idx={idx} togglingId={togglingId} toggleApplied={toggleApplied} />
            ))}
          </div>

          {/* Applied jobs — separate section at bottom */}
          {appliedJobs.length > 0 && (
            <>
              <div className="flex items-center gap-3 mt-10 mb-4">
                <div className="h-px flex-1 bg-border" />
                <p className="text-muted-foreground text-xs shrink-0" style={monoStyle}>
                  <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-600 dark:text-emerald-400" />
                  Applied · {appliedJobs.length}
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2 opacity-75">
                {appliedJobs.map(({ job, score }, idx) => (
                  <JobCard key={job.id} job={job} score={score} idx={idx} togglingId={togglingId} toggleApplied={toggleApplied} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
