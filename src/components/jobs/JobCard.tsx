"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { RejectReasonModal } from "@/components/jobs/RejectReasonModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Target,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Circle,
  Loader2,
  Eye,
  Download,
  FileText,
  PhoneCall,
  XCircle,
  RotateCcw,
} from "lucide-react";
import type { RejectionReasonKey } from "@/lib/rejection-reasons";
import { RejectionReasonChip } from "@/components/jobs/RejectionReasonChip";

export interface Job {
  id: string;
  title: string;
  company: string;
  url?: string;
  sponsorship?: string;
  applied: boolean;
  appliedAt?: string;
  callbackReceived?: boolean;
  callbackAt?: string;
  rejected?: boolean;
  rejectedAt?: string;
  rejectionReason?: RejectionReasonKey | null;
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

export const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

export function getMatchScore(job: Job): number | null {
  if (job.matchResult) {
    try {
      const cached = JSON.parse(job.matchResult);
      if (cached?.overallScore) return cached.overallScore;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
      <Target className="w-3 h-3" />
      {score}%
    </span>
  );
}

export interface JobCardProps {
  job: Job;
  score: number | null;
  idx: number;
  togglingId: string | null;
  togglingCallbackId: string | null;
  togglingRejectedId: string | null;
  toggleApplied: (id: string, current: boolean) => void;
  toggleCallback: (id: string, current: boolean) => void;
  toggleRejected: (id: string, current: boolean, reason?: import("@/lib/rejection-reasons").RejectionReasonKey) => void;
  showCallbackButton?: boolean;
  showRejectButton?: boolean;
  showAppliedButton?: boolean;
  showRejectionChip?: boolean;
  onEditReason?: (job: Job) => void;
}

export function JobCard({
  job,
  score,
  idx,
  togglingId,
  togglingCallbackId,
  togglingRejectedId,
  toggleApplied,
  toggleCallback,
  toggleRejected,
  showCallbackButton = true,
  showRejectButton = true,
  showAppliedButton = true,
  showRejectionChip = false,
  onEditReason,
}: JobCardProps) {
  const hasCallback = !!job.callbackReceived;
  const isRejected = !!job.rejected;
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  return (
    <div
      className={cn(
        "border border-border rounded-sm transition-colors hover:bg-accent/10 scroll-reveal",
        job.applied && !hasCallback && !isRejected && "bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30",
        hasCallback && !isRejected && "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/70 dark:border-amber-700/50 ring-1 ring-amber-300/40 dark:ring-amber-700/30",
        isRejected && "bg-red-50/30 dark:bg-red-950/20 border-red-200/60 dark:border-red-800/40"
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
            {hasCallback && !isRejected && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700 font-semibold">
                <PhoneCall className="w-2.5 h-2.5" /> Callback
              </Badge>
            )}
            {isRejected && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 font-semibold">
                <XCircle className="w-2.5 h-2.5" /> Rejected
              </Badge>
            )}
            {isRejected && showRejectionChip && (
              <RejectionReasonChip
                reason={job.rejectionReason ?? null}
                onEditClick={onEditReason ? () => onEditReason(job) : undefined}
              />
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
            {isRejected && job.rejectedAt && (
              <span className="text-red-700 dark:text-red-400">
                · Rejected {new Date(job.rejectedAt).toLocaleDateString()}
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
          {showCallbackButton && job.applied && !isRejected && (
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
          {showRejectButton && job.applied && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-1.5 text-xs h-8",
                isRejected
                  ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-300 dark:border-red-800"
                  : "text-muted-foreground hover:text-red-700 hover:border-red-300 dark:hover:text-red-400 dark:hover:border-red-700"
              )}
              onClick={() => {
                if (isRejected) {
                  toggleRejected(job.id, true);
                } else {
                  setRejectModalOpen(true);
                }
              }}
              disabled={togglingRejectedId === job.id}
              title={isRejected ? "Restore to shortlist" : "Mark as rejected"}
            >
              {togglingRejectedId === job.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isRejected ? (
                <RotateCcw className="w-3 h-3" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">
                {isRejected ? "Restore" : "Reject"}
              </span>
            </Button>
          )}
          {showAppliedButton && (
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
          )}
        </div>
      </div>
      <RejectReasonModal
        open={rejectModalOpen}
        onOpenChange={setRejectModalOpen}
        jobTitle={job.title}
        jobCompany={job.company}
        currentReason={job.rejectionReason ?? null}
        onSubmit={async (reason) => {
          await toggleRejected(job.id, false, reason);
        }}
      />
    </div>
  );
}
