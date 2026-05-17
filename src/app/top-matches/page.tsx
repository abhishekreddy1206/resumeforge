"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/lib/hooks/use-scroll-reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  Inbox,
  PhoneCall,
} from "lucide-react";
import {
  JobCard,
  getMatchScore,
  monoStyle,
  type Job,
} from "@/components/jobs/JobCard";

const PAGE_SIZE = 10;

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
  const [togglingRejectedId, setTogglingRejectedId] = useState<string | null>(null);
  const [callbackVisible, setCallbackVisible] = useState(PAGE_SIZE);
  const [awaitingVisible, setAwaitingVisible] = useState(PAGE_SIZE);
  const listRef = useScrollReveal<HTMLDivElement>([jobs, callbackVisible, awaitingVisible]);

  async function fetchJobs() {
    try {
      const all: Job[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(
          `/api/jobs?onlyApplied=true&excludeRejected=true&excludeArchived=true&pageSize=50&page=${page}`,
        );
        if (!res.ok) break;
        const data = await res.json();
        const batch: Job[] = data.jobs || [];
        all.push(...batch);
        if (batch.length < 50 || all.length >= (data.total ?? all.length)) break;
        page += 1;
        if (page > 20) break; // safety cap: 1000 jobs
      }
      setJobs(all);
      setCallbackVisible(PAGE_SIZE);
      setAwaitingVisible(PAGE_SIZE);
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
        // un-applying — drop from list; server also cleared callback + rejected
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

  async function toggleRejected(jobId: string, current: boolean, reason?: import("@/lib/rejection-reasons").RejectionReasonKey) {
    setTogglingRejectedId(jobId);
    try {
      const res = await fetch("/api/jobs/rejected", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, rejected: !current, ...(reason ? { reason } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update");
      }
      // marking rejected from /top-matches — drop from list (it now lives on /rejected)
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast.success(!current ? "Marked rejected" : "Restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setTogglingRejectedId(null);
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
          All roles you&apos;ve applied to. Mark the ones where you heard back to track your funnel — or mark rejections to keep this view focused.
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
              {appliedCount} active · {callbackCount} callback{callbackCount === 1 ? "" : "s"} · {responseRate}% response rate
            </p>
          </div>

          <div ref={listRef}>
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
                <div className="space-y-2">
                  {callbackJobs.slice(0, callbackVisible).map(({ job, score }, idx) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      score={score}
                      idx={idx}
                      togglingId={togglingId}
                      togglingCallbackId={togglingCallbackId}
                      togglingRejectedId={togglingRejectedId}
                      toggleApplied={toggleApplied}
                      toggleCallback={toggleCallback}
                      toggleRejected={toggleRejected}
                    />
                  ))}
                </div>
                {callbackVisible < callbackJobs.length && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() =>
                        setCallbackVisible((v) =>
                          Math.min(v + PAGE_SIZE, callbackJobs.length),
                        )
                      }
                    >
                      Show more ({callbackJobs.length - callbackVisible} remaining)
                    </Button>
                  </div>
                )}
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
                  {awaitingJobs.slice(0, awaitingVisible).map(({ job, score }, idx) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      score={score}
                      idx={idx}
                      togglingId={togglingId}
                      togglingCallbackId={togglingCallbackId}
                      togglingRejectedId={togglingRejectedId}
                      toggleApplied={toggleApplied}
                      toggleCallback={toggleCallback}
                      toggleRejected={toggleRejected}
                    />
                  ))}
                </div>
                {awaitingVisible < awaitingJobs.length && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() =>
                        setAwaitingVisible((v) =>
                          Math.min(v + PAGE_SIZE, awaitingJobs.length),
                        )
                      }
                    >
                      Show more ({awaitingJobs.length - awaitingVisible} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
