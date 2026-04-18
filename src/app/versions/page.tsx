"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { monoStyle, ProgressBar } from "./_components/shared";

interface JobRow {
  id: string;
  title: string;
  company: string;
  applied: boolean;
  appliedAt: string | null;
  latestScore: number | null;
  latestDelta: number | null;
  latestScoreVersion: number | null;
  latestVersionId: string | null;
  scoreTrend: number[];
  versionCount: number;
  pdfCount: number;
  docxCount: number;
  lastActivityAt: string | null;
}

interface UnlinkedResume {
  id: string;
  format: string;
  createdAt: string;
  evaluationStatus: string | null;
  evaluationVersion: number | null;
  job: { id: string; title: string; company: string };
}

interface ApiResponse {
  items: JobRow[];
  total: number;
  page: number;
  pageSize: number;
  unlinkedResumes: UnlinkedResume[];
}

const PAGE_SIZE = 10;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TrendPills({ trend }: { trend: number[] }) {
  if (trend.length === 0) return null;
  return (
    <div className="flex items-center gap-0.5">
      {trend.map((score, i) => (
        <span
          key={i}
          className="font-mono text-[10px] px-1 py-0.5 rounded-sm bg-muted/60 text-muted-foreground"
          title={`v${i + 1}: ${Math.round(score)}%`}
        >
          {Math.round(score)}
        </span>
      ))}
    </div>
  );
}

export default function VersionsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/profile/versions?page=${targetPage}&pageSize=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch {
      setData({
        items: [],
        total: 0,
        page: targetPage,
        pageSize: PAGE_SIZE,
        unlinkedResumes: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data]);

  return (
    <div className="space-y-0">
      {/* Header */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Versions
          {data && data.total > 0 && ` · ${data.total} jobs`}
        </p>
        <h1
          className="text-foreground leading-none"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: "clamp(2.5rem, 6vw, 4rem)",
            fontWeight: 400,
          }}
        >
          Resume history
        </h1>
        <p className="mt-4 text-sm text-muted-foreground max-w-xl">
          Every job you&apos;ve scored keeps its own thread of saved profile
          snapshots. Open one to see what changed between versions.
        </p>
      </section>

      {/* Body */}
      <section className="pt-8 space-y-8">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border rounded-md space-y-3">
            <History className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              No saved profile versions yet.
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Score a job on the <Link href="/jobs" className="text-primary hover:underline">Jobs</Link> page
              and save an optimized version to start building your history.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {data.items.map((job) => (
                <JobRowCard key={job.id} job={job} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground" style={monoStyle}>
                  Page {data.page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={data.page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={data.page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Unlinked resumes */}
        {data && data.unlinkedResumes.length > 0 && (
          <div className="pt-8 border-t border-border/60">
            <p className="text-muted-foreground mb-3" style={monoStyle}>
              Unlinked resumes · {data.unlinkedResumes.length}
            </p>
            <p className="text-xs text-muted-foreground mb-4 max-w-xl">
              These resumes were generated directly from your profile (not from
              a saved version). They remain downloadable.
            </p>
            <div className="space-y-1">
              {data.unlinkedResumes.slice(0, 10).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-1.5 px-2.5 border border-border rounded-sm text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {r.job.title}
                      <span className="text-muted-foreground">
                        {" "}
                        · {r.job.company}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[8px] px-1 py-0 rounded-sm shrink-0"
                    >
                      {r.format.toUpperCase()}
                    </Badge>
                    <span
                      className="text-muted-foreground shrink-0"
                      style={{ ...monoStyle, fontSize: "0.5rem" }}
                    >
                      {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <a
                    href={`/api/resume/download/${r.id}`}
                    download
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0 ml-2"
                  >
                    <Download className="w-2.5 h-2.5" />
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function JobRowCard({ job }: { job: JobRow }) {
  const score = job.latestScore ?? 0;
  return (
    <Link
      href={`/versions/${job.id}`}
      className="group block border border-border rounded-md bg-card hover:border-primary/40 hover:bg-muted/20 transition-colors"
    >
      <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
        {/* Score tile */}
        <div className="w-12 h-12 flex flex-col items-center justify-center shrink-0 border border-border rounded-sm">
          {job.latestScore != null ? (
            <>
              <span className="text-lg font-bold text-primary leading-none">
                {Math.round(score)}
              </span>
              <span className="text-[8px] text-muted-foreground leading-none mt-0.5">
                latest
              </span>
            </>
          ) : (
            <Briefcase className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {/* Title + company */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{job.title}</p>
            {job.applied && (
              <Badge
                variant="secondary"
                className="text-[9px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                Applied
              </Badge>
            )}
            {job.latestDelta != null && job.latestDelta > 0 && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1 py-0 rounded-sm gap-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              >
                <TrendingUp className="w-2 h-2" />+{Math.round(job.latestDelta)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {job.company}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span
              className="text-muted-foreground"
              style={{ ...monoStyle, fontSize: "0.55rem" }}
            >
              {job.versionCount}v · {job.pdfCount}pdf{job.docxCount > 0 && ` · ${job.docxCount}docx`}
            </span>
            <span
              className="text-muted-foreground"
              style={{ ...monoStyle, fontSize: "0.55rem" }}
            >
              Updated {formatDate(job.lastActivityAt)}
            </span>
            <TrendPills trend={job.scoreTrend} />
          </div>
        </div>

        {/* Progress + CTA */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="w-36 hidden md:block">
            <ProgressBar
              value={score}
              label={job.latestScore != null ? `${Math.round(score)}%` : "—"}
            />
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-primary group-hover:underline">
            View history
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

