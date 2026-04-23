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
  Inbox,
  Loader2,
  Eye,
  Download,
  FileText,
  PhoneCall,
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  company: string;
  url?: string;
  sponsorship?: string;
  applied: boolean;
  appliedAt?: string;
  callbackReceived?: boolean;
  callbackAt?: string;
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

function JobCard({
  job,
  score,
  idx,
  togglingId,
  togglingCallbackId,
  toggleApplied,
  toggleCallback,
}: {
  job: Job;
  score: number | null;
  idx: number;
  togglingId: string | null;
  togglingCallbackId: string | null;
  toggleApplied: (id: string, current: boolean) => void;
  toggleCallback: (id: string, current: boolean) => void;
}) {
  const hasCallback = !!job.callbackReceived;
  return (
    <div
      className={cn(
        "border border-border rounded-sm transition-colors hover:bg-accent/10 scroll-reveal",
        job.applied && !hasCallback && "bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30",
        hasCallback && "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/70 dark:border-amber-700/50 ring-1 ring-amber-300/40 dark:ring-amber-700/30"
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
            {score !== null && <ScoreBadge score={score} />}
            {hasCallback && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700 font-semibold">
                <PhoneCall className="w-2.5 h-2.5" /> Callback
              </Badge>
            )}
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
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{job.company}</span>
            {job.appliedAt && (
              <span className="text-emerald-600 dark:text-emerald-400">
                · Applied {new Date(job.appliedAt).toLocaleDateString()}
              </span>
            )}
            {hasCallback && job.callbackAt && (
              <span className="text-amber-700 dark:text-amber-300">
                · Heard back {new Date(job.callbackAt).toLocaleDateString()}
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
          {job.applied && (
            <Button
              variant={hasCallback ? "default" : "outline"}
              size="sm"
              className={cn(
                "gap-1.5 text-xs h-8",
                hasCallback && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
              )}
              onClick={() => toggleCallback(job.id, hasCallback)}
              disabled={togglingCallbackId === job.id}
              title={hasCallback ? "Clear callback" : "Mark as heard back"}
            >
              {togglingCallbackId === job.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <PhoneCall className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">
                {hasCallback ? "Callback" : "Log callback"}
              </span>
            </Button>
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
  const [togglingCallbackId, setTogglingCallbackId] = useState<string | null>(null);
  const listRef = useScrollReveal<HTMLDivElement>([jobs]);

  async function fetchJobs() {
    try {
      const all: Job[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(`/api/jobs?onlyApplied=true&pageSize=50&page=${page}`);
        if (!res.ok) break;
        const data = await res.json();
        const batch: Job[] = data.jobs || [];
        all.push(...batch);
        if (batch.length < 50 || all.length >= (data.total ?? all.length)) break;
        page += 1;
        if (page > 20) break; // safety cap: 1000 jobs
      }
      setJobs(all);
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
      if (!current) {
        // marking applied — keep in list
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? { ...j, applied: true, appliedAt: new Date().toISOString() }
              : j
          )
        );
      } else {
        // un-applying — drop from list; server also cleared callback
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
      toast.success(!current ? "Marked as applied" : "Unmarked");
    } catch {
      toast.error("Failed to update applied status");
    } finally {
      setTogglingId(null);
    }
  }

  async function toggleCallback(jobId: string, current: boolean) {
    setTogglingCallbackId(jobId);
    try {
      const res = await fetch("/api/jobs/callback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, callbackReceived: !current }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update");
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                callbackReceived: !current,
                callbackAt: !current ? new Date().toISOString() : undefined,
              }
            : j
        )
      );
      toast.success(!current ? "Callback logged" : "Callback cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update callback");
    } finally {
      setTogglingCallbackId(null);
    }
  }

  const appliedJobs = jobs
    .filter((j) => j.applied)
    .map((job) => ({ job, score: getMatchScore(job) }))
    .sort((a, b) => {
      const at = a.job.appliedAt ? new Date(a.job.appliedAt).getTime() : new Date(a.job.createdAt).getTime();
      const bt = b.job.appliedAt ? new Date(b.job.appliedAt).getTime() : new Date(b.job.createdAt).getTime();
      return bt - at;
    });

  const callbackJobs = appliedJobs
    .filter((t) => t.job.callbackReceived)
    .sort((a, b) => {
      const at = a.job.callbackAt ? new Date(a.job.callbackAt).getTime() : 0;
      const bt = b.job.callbackAt ? new Date(b.job.callbackAt).getTime() : 0;
      return bt - at;
    });
  const awaitingJobs = appliedJobs.filter((t) => !t.job.callbackReceived);

  const appliedCount = appliedJobs.length;
  const callbackCount = callbackJobs.length;
  const responseRate = appliedCount > 0 ? Math.round((callbackCount / appliedCount) * 100) : 0;

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-0">
      {/* Header */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Shortlist · Applied Jobs
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
          Your <span className="text-primary">Applied</span> Roles
        </h1>
        <p className="text-muted-foreground max-w-lg leading-relaxed text-sm">
          All roles you&apos;ve applied to. Mark the ones where you heard back to track your funnel.
        </p>
      </section>

      {appliedCount === 0 ? (
        <section className="pt-16 pb-20 text-center anim-fade-up">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground/30 mb-4" />
          <p
            className="text-foreground mb-2"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "1.4rem",
              fontWeight: 400,
            }}
          >
            No applied jobs yet
          </p>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Mark jobs applied from the Jobs page to track them here and log callbacks as they come in.
          </p>
        </section>
      ) : (
        <section className="pt-8 anim-fade-up-2">
          <div className="flex items-center justify-between mb-5">
            <p className="text-muted-foreground" style={monoStyle}>
              {appliedCount} applied · {callbackCount} callback{callbackCount === 1 ? "" : "s"} · {responseRate}% response rate
            </p>
          </div>

          {/* Callback received — top */}
          {callbackJobs.length > 0 && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border" />
                <p className="text-muted-foreground text-xs shrink-0" style={monoStyle}>
                  <PhoneCall className="w-3 h-3 inline mr-1 text-amber-600 dark:text-amber-400" />
                  Callback received · {callbackJobs.length}
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2" ref={listRef}>
                {callbackJobs.map(({ job, score }, idx) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    score={score}
                    idx={idx}
                    togglingId={togglingId}
                    togglingCallbackId={togglingCallbackId}
                    toggleApplied={toggleApplied}
                    toggleCallback={toggleCallback}
                  />
                ))}
              </div>
            </>
          )}

          {/* Awaiting response */}
          {awaitingJobs.length > 0 && (
            <>
              <div className={cn("flex items-center gap-3 mb-4", callbackJobs.length > 0 && "mt-10")}>
                <div className="h-px flex-1 bg-border" />
                <p className="text-muted-foreground text-xs shrink-0" style={monoStyle}>
                  <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-600 dark:text-emerald-400" />
                  Awaiting response · {awaitingJobs.length}
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {awaitingJobs.map(({ job, score }, idx) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    score={score}
                    idx={idx}
                    togglingId={togglingId}
                    togglingCallbackId={togglingCallbackId}
                    toggleApplied={toggleApplied}
                    toggleCallback={toggleCallback}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
