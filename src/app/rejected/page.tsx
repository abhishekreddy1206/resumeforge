"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/lib/hooks/use-scroll-reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Inbox,
  PhoneCall,
  XCircle,
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

export default function RejectedPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingCallbackId, setTogglingCallbackId] = useState<string | null>(null);
  const [togglingRejectedId, setTogglingRejectedId] = useState<string | null>(null);
  const [postCallbackVisible, setPostCallbackVisible] = useState(PAGE_SIZE);
  const [silentVisible, setSilentVisible] = useState(PAGE_SIZE);
  const listRef = useScrollReveal<HTMLDivElement>([
    jobs,
    postCallbackVisible,
    silentVisible,
  ]);

  async function fetchJobs() {
    try {
      const all: Job[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(
          `/api/jobs?onlyApplied=true&onlyRejected=true&excludeArchived=true&pageSize=50&page=${page}`,
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
      setPostCallbackVisible(PAGE_SIZE);
      setSilentVisible(PAGE_SIZE);
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
      // un-applying clears rejected too — drop from this page
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast.success("Unmarked");
    } catch {
      toast.error("Failed to update applied status");
    } finally {
      setTogglingId(null);
    }
  }

  async function toggleCallback(jobId: string, current: boolean) {
    // No-op surface here: the JobCard hides the callback button on /rejected.
    // Keeping the handler so the component contract is satisfied.
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
            : j,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update callback");
    } finally {
      setTogglingCallbackId(null);
    }
  }

  async function toggleRejected(jobId: string, current: boolean) {
    setTogglingRejectedId(jobId);
    try {
      const res = await fetch("/api/jobs/rejected", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, rejected: !current }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update");
      }
      // restoring (current=true → rejected=false) drops from this page
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast.success(current ? "Restored to shortlist" : "Marked rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setTogglingRejectedId(null);
    }
  }

  const rejectedJobs = jobs
    .filter((j) => j.rejected)
    .map((job) => ({ job, score: getMatchScore(job) }))
    .sort((a, b) => {
      const at = a.job.rejectedAt ? new Date(a.job.rejectedAt).getTime() : 0;
      const bt = b.job.rejectedAt ? new Date(b.job.rejectedAt).getTime() : 0;
      return bt - at;
    });

  const postCallbackJobs = rejectedJobs.filter((t) => t.job.callbackReceived);
  const silentJobs = rejectedJobs.filter((t) => !t.job.callbackReceived);

  const rejectedCount = rejectedJobs.length;
  const hadCallbackCount = postCallbackJobs.length;

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-0">
      {/* Header */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Shortlist · Rejected
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
          Rejected <span className="text-primary">Roles</span>
        </h1>
        <p className="text-muted-foreground max-w-lg leading-relaxed text-sm">
          Roles that didn&apos;t move forward. Use these to reflect on what to improve — the closest losses are the most informative.
        </p>
      </section>

      {rejectedCount === 0 ? (
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
            No rejections yet — keep going
          </p>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Mark a job rejected from the Shortlist when you hear no, and it&apos;ll show up here for reflection.
          </p>
        </section>
      ) : (
        <section className="pt-8 anim-fade-up-2">
          <div className="flex items-center justify-between mb-5">
            <p className="text-muted-foreground" style={monoStyle}>
              {rejectedCount} rejected · {hadCallbackCount} reached callback stage
            </p>
          </div>

          <div ref={listRef}>
            {/* Reached callback then rejected — highest-signal losses */}
            {postCallbackJobs.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-border" />
                  <p className="text-muted-foreground text-xs shrink-0" style={monoStyle}>
                    <PhoneCall className="w-3 h-3 inline mr-1 text-amber-600 dark:text-amber-400" />
                    Reached callback then rejected · {postCallbackJobs.length}
                  </p>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {postCallbackJobs.slice(0, postCallbackVisible).map(({ job, score }, idx) => (
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
                      showCallbackButton={false}
                      showAppliedButton={false}
                    />
                  ))}
                </div>
                {postCallbackVisible < postCallbackJobs.length && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() =>
                        setPostCallbackVisible((v) =>
                          Math.min(v + PAGE_SIZE, postCallbackJobs.length),
                        )
                      }
                    >
                      Show more ({postCallbackJobs.length - postCallbackVisible} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Silent rejection */}
            {silentJobs.length > 0 && (
              <>
                <div className={cn("flex items-center gap-3 mb-4", postCallbackJobs.length > 0 && "mt-10")}>
                  <div className="h-px flex-1 bg-border" />
                  <p className="text-muted-foreground text-xs shrink-0" style={monoStyle}>
                    <XCircle className="w-3 h-3 inline mr-1 text-red-600 dark:text-red-400" />
                    Silent rejection · {silentJobs.length}
                  </p>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {silentJobs.slice(0, silentVisible).map(({ job, score }, idx) => (
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
                      showCallbackButton={false}
                      showAppliedButton={false}
                    />
                  ))}
                </div>
                {silentVisible < silentJobs.length && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() =>
                        setSilentVisible((v) =>
                          Math.min(v + PAGE_SIZE, silentJobs.length),
                        )
                      }
                    >
                      Show more ({silentJobs.length - silentVisible} remaining)
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
