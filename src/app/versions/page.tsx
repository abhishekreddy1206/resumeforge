"use client";

import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  History,
  Download,
  Trash2,
  FileText,
  Briefcase,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
  Eye,
  X,
  Building2,
  CheckCircle2,
  Circle,
} from "lucide-react";

/* ── Types ── */

interface VersionResume {
  id: string;
  format: string;
  createdAt: string;
}

interface ProfileVersion {
  id: string;
  snapshot: string;
  score: number;
  delta: number | null;
  label: string | null;
  createdAt: string;
  job: { id: string; title: string; company: string };
  resumes: VersionResume[];
}

interface JobSummary {
  id: string;
  title: string;
  company: string;
  matchResult: string | null;
  matchedAt: string | null;
  createdAt: string;
  profileVersions: { id: string; score: number; delta: number | null; createdAt: string }[];
  resumes: { id: string; format: string; profileVersionId: string | null; createdAt: string }[];
}

interface UnlinkedResume {
  id: string;
  format: string;
  createdAt: string;
  job: { id: string; title: string; company: string };
}

interface CompanyGroup {
  company: string;
  jobs: JobSummary[];
  totalVersions: number;
  totalResumes: number;
  bestScore: number | null;
  hasScore: boolean;
  hasPdf: boolean;
}

type FormatOption = "pdf" | "docx" | "latex";

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

/* ── Progress Bar ── */

function ProgressBar({
  value,
  label,
  color = "primary",
}: {
  value: number;
  label: string;
  color?: "primary" | "emerald" | "amber";
}) {
  const colorClass =
    color === "emerald"
      ? "bg-emerald-500"
      : color === "amber"
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground shrink-0" style={{ ...monoStyle, fontSize: "0.55rem" }}>
        {label}
      </span>
    </div>
  );
}

/* ── Helpers ── */

function groupByCompany(jobs: JobSummary[]): CompanyGroup[] {
  const map = new Map<string, JobSummary[]>();
  for (const job of jobs) {
    const list = map.get(job.company) || [];
    list.push(job);
    map.set(job.company, list);
  }

  return Array.from(map.entries())
    .map(([company, companyJobs]) => {
      const totalVersions = companyJobs.reduce((s, j) => s + j.profileVersions.length, 0);
      const totalResumes = companyJobs.reduce((s, j) => s + j.resumes.length, 0);
      const scores = companyJobs
        .flatMap((j) => j.profileVersions.map((v) => v.score))
        .filter((s) => s > 0);
      const bestScore = scores.length > 0 ? Math.max(...scores) : null;
      const hasScore = companyJobs.every((j) => j.matchResult != null);
      const hasPdf = companyJobs.every((j) => j.resumes.some((r) => r.format === "pdf"));

      return { company, jobs: companyJobs, totalVersions, totalResumes, bestScore, hasScore, hasPdf };
    })
    .sort((a, b) => {
      // Sort by best score descending, then by name
      if (a.bestScore != null && b.bestScore != null) return b.bestScore - a.bestScore;
      if (a.bestScore != null) return -1;
      if (b.bestScore != null) return 1;
      return a.company.localeCompare(b.company);
    });
}

function getJobProgress(job: JobSummary) {
  const steps = { scored: !!job.matchResult, versioned: job.profileVersions.length > 0, pdf: job.resumes.some((r) => r.format === "pdf") };
  const done = [steps.scored, steps.versioned, steps.pdf].filter(Boolean).length;
  return { ...steps, done, total: 3, pct: Math.round((done / 3) * 100) };
}

function getCompanyProgress(group: CompanyGroup) {
  const jobProgresses = group.jobs.map(getJobProgress);
  const totalSteps = jobProgresses.reduce((s, p) => s + p.total, 0);
  const doneSteps = jobProgresses.reduce((s, p) => s + p.done, 0);
  return { pct: totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0, doneSteps, totalSteps };
}

/* ── Main Page ── */

export default function VersionsPage() {
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [unlinkedResumes, setUnlinkedResumes] = useState<UnlinkedResume[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewResumeId, setPreviewResumeId] = useState<string | null>(null);

  function loadData() {
    fetch("/api/profile/versions")
      .then((r) => r.json())
      .then((data) => {
        setVersions(Array.isArray(data.versions) ? data.versions : []);
        setUnlinkedResumes(Array.isArray(data.unlinkedResumes) ? data.unlinkedResumes : []);
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  const companyGroups = groupByCompany(jobs);
  const totalJobs = jobs.length;
  const totalVersions = versions.length;
  const jobsWithPdf = jobs.filter((j) => j.resumes.some((r) => r.format === "pdf")).length;
  const jobsWithScore = jobs.filter((j) => j.matchResult != null).length;

  async function handleGenerate(version: ProfileVersion, format: FormatOption) {
    setGeneratingFor(version.id);
    try {
      const snapshot =
        typeof version.snapshot === "string" ? JSON.parse(version.snapshot) : version.snapshot;

      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: version.job.id,
          format,
          profileOverride: snapshot,
          profileVersionId: version.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      toast.success(`${format.toUpperCase()} resume generated!`);

      if (format === "pdf") setPreviewResumeId(data.id);

      // Refresh data to pick up new resume
      loadData();
    } catch (err) {
      toast.error(`Generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setGeneratingFor(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/profile/versions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Version deleted");
      loadData();
    } catch {
      toast.error("Failed to delete version");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-0">
        <div className="border-b border-border pb-10 pt-2">
          <Skeleton className="h-3 w-20 mb-8" />
          <Skeleton className="h-14 w-64 mb-4" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="pt-8 space-y-4">
          <Skeleton className="h-20 w-full rounded-sm" />
          <Skeleton className="h-20 w-full rounded-sm" />
          <Skeleton className="h-20 w-full rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* ── Header ── */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Versions · {companyGroups.length} companies · {totalJobs} jobs
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
          Resume <span className="text-primary">history</span>
        </h1>
        <div className="section-divider mt-5" />

        {/* Overall stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-2xl font-bold text-foreground">{totalJobs}</p>
            <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>Jobs tracked</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalVersions}</p>
            <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>Saved versions</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{jobsWithScore}/{totalJobs}</p>
            <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>Scored</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{jobsWithPdf}/{totalJobs}</p>
            <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>PDFs generated</p>
          </div>
        </div>
      </section>

      {/* ── Company Groups ── */}
      <section className="pt-4 anim-fade-up-1">
        {companyGroups.length === 0 ? (
          <div className="py-16 text-center border border-border">
            <History className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm font-medium mb-1">No jobs yet</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Add job descriptions to start tracking your resume optimization progress.
            </p>
            <a
              href="/jobs"
              className={buttonVariants({ variant: "outline", size: "sm", className: "rounded-sm mt-4" })}
            >
              <Briefcase className="w-3.5 h-3.5 mr-1.5" />
              Go to Jobs
            </a>
          </div>
        ) : (
          <div className="space-y-0">
            {companyGroups.map((group, gi) => {
              const isExpanded = expandedCompany === group.company;
              const progress = getCompanyProgress(group);

              return (
                <div key={group.company} className={`border-t border-border ${gi === companyGroups.length - 1 ? "border-b" : ""}`}>
                  {/* Company row */}
                  <button
                    onClick={() => {
                      setExpandedCompany(isExpanded ? null : group.company);
                      setExpandedJob(null);
                      setExpandedVersion(null);
                    }}
                    className={`w-full text-left py-4 px-2 flex items-center gap-4 transition-colors ${
                      isExpanded ? "bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0 border border-border rounded-sm bg-card">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{group.company}</p>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-sm shrink-0">
                          {group.jobs.length} {group.jobs.length === 1 ? "job" : "jobs"}
                        </Badge>
                        {group.bestScore != null && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0"
                          >
                            Best: {group.bestScore}%
                          </Badge>
                        )}
                      </div>
                      <ProgressBar
                        value={progress.pct}
                        label={`${progress.doneSteps}/${progress.totalSteps} steps`}
                        color={progress.pct === 100 ? "emerald" : progress.pct > 50 ? "primary" : "amber"}
                      />
                    </div>

                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {/* Expanded: Jobs within company */}
                  {isExpanded && (
                    <div className="pb-2">
                      {group.jobs.map((job) => {
                        const isJobExpanded = expandedJob === job.id;
                        const jp = getJobProgress(job);
                        const jobVersions = versions.filter((v) => v.job.id === job.id);
                        let matchScore: number | null = null;
                        if (job.matchResult) {
                          try {
                            const mr = JSON.parse(job.matchResult);
                            matchScore = mr.score ?? mr.overallScore ?? null;
                          } catch { /* ignore */ }
                        }

                        return (
                          <div key={job.id} className="border-t border-border/50">
                            {/* Job row */}
                            <button
                              onClick={() => {
                                setExpandedJob(isJobExpanded ? null : job.id);
                                setExpandedVersion(null);
                              }}
                              className={`w-full text-left py-3 pl-4 sm:pl-8 pr-2 flex items-center gap-3 transition-colors ${
                                isJobExpanded ? "bg-muted/30" : "hover:bg-muted/20"
                              }`}
                            >
                              {/* Score circle */}
                              <div className="w-9 h-9 flex flex-col items-center justify-center shrink-0 border border-border rounded-sm">
                                {matchScore != null ? (
                                  <>
                                    <span className="text-sm font-bold text-primary leading-none">{matchScore}</span>
                                    <span className="text-[8px] text-muted-foreground">ATS</span>
                                  </>
                                ) : (
                                  <span className="text-[9px] text-muted-foreground">—</span>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{job.title}</p>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <StepIndicator done={jp.scored} label="Score" />
                                  <StepIndicator done={jp.versioned} label="Version" />
                                  <StepIndicator done={jp.pdf} label="PDF" />
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {job.resumes.length > 0 && (
                                  <div className="flex gap-0.5">
                                    {[...new Set(job.resumes.map((r) => r.format))].map((fmt) => (
                                      <Badge key={fmt} variant="outline" className="text-[9px] px-1 py-0 rounded-sm">
                                        {fmt === "latex" ? "TEX" : fmt.toUpperCase()}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {isJobExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                              </div>
                            </button>

                            {/* Expanded: Job detail with versions */}
                            {isJobExpanded && (
                              <div className="pl-4 sm:pl-8 pr-2 pb-4 space-y-4">
                                {/* Job metadata */}
                                <div className="flex items-center gap-4 pt-1">
                                  <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>
                                    Added {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    {job.matchedAt && ` · Scored ${new Date(job.matchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                                  </p>
                                  <a
                                    href="/jobs"
                                    className="text-primary text-xs hover:underline"
                                    style={monoStyle}
                                  >
                                    Open in Jobs
                                  </a>
                                </div>

                                {/* Versions for this job */}
                                {jobVersions.length > 0 ? (
                                  <div>
                                    <p className="text-muted-foreground mb-2" style={monoStyle}>
                                      {jobVersions.length} {jobVersions.length === 1 ? "Version" : "Versions"}
                                    </p>
                                    <div className="space-y-0">
                                      {jobVersions.map((version, vi) => {
                                        const isVerExpanded = expandedVersion === version.id;
                                        const isGenerating = generatingFor === version.id;

                                        return (
                                          <div key={version.id} className={`border-t border-border/40 ${vi === jobVersions.length - 1 ? "border-b border-border/40" : ""}`}>
                                            <button
                                              onClick={() => setExpandedVersion(isVerExpanded ? null : version.id)}
                                              className={`w-full text-left py-2.5 px-2 flex items-center gap-3 transition-colors ${
                                                isVerExpanded ? "bg-primary/5" : "hover:bg-muted/20"
                                              }`}
                                            >
                                              <div className="w-8 h-8 flex flex-col items-center justify-center shrink-0 border border-border rounded-sm">
                                                <span className="text-sm font-bold text-primary leading-none">{version.score}</span>
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <p className="text-xs font-medium">
                                                    v{jobVersions.length - vi}
                                                  </p>
                                                  {version.delta != null && version.delta > 0 && (
                                                    <Badge
                                                      variant="secondary"
                                                      className="text-[9px] px-1 py-0 rounded-sm gap-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                    >
                                                      <TrendingUp className="w-2 h-2" />+{version.delta}
                                                    </Badge>
                                                  )}
                                                  {version.resumes.length > 0 && (
                                                    <div className="flex gap-0.5">
                                                      {version.resumes.map((r) => (
                                                        <Badge key={r.id} variant="outline" className="text-[8px] px-1 py-0 rounded-sm">
                                                          {r.format === "latex" ? "TEX" : r.format.toUpperCase()}
                                                        </Badge>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                                <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.5rem" }}>
                                                  {new Date(version.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                </p>
                                              </div>
                                              {isVerExpanded ? (
                                                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                                              ) : (
                                                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                              )}
                                            </button>

                                            {isVerExpanded && (
                                              <div className="px-2 pb-4 space-y-3">
                                                {/* Generate buttons */}
                                                <div>
                                                  <p className="text-muted-foreground mb-2" style={monoStyle}>Generate Resume</p>
                                                  <div className="flex gap-2">
                                                    {(["pdf", "docx", "latex"] as FormatOption[]).map((fmt) => (
                                                      <Button
                                                        key={fmt}
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-1.5 rounded-sm text-xs flex-1"
                                                        disabled={isGenerating}
                                                        onClick={() => handleGenerate(version, fmt)}
                                                      >
                                                        {isGenerating ? (
                                                          <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                          <Sparkles className="w-3 h-3" />
                                                        )}
                                                        {fmt === "latex" ? "LaTeX" : fmt.toUpperCase()}
                                                      </Button>
                                                    ))}
                                                  </div>
                                                </div>

                                                {/* Existing resumes */}
                                                {version.resumes.length > 0 && (
                                                  <div>
                                                    <p className="text-muted-foreground mb-1.5" style={monoStyle}>Generated Resumes</p>
                                                    <div className="space-y-1">
                                                      {version.resumes.map((r) => (
                                                        <div
                                                          key={r.id}
                                                          className={`flex items-center justify-between py-1.5 px-2.5 border rounded-sm transition-colors ${
                                                            previewResumeId === r.id ? "border-primary bg-primary/5" : "border-border"
                                                          }`}
                                                        >
                                                          <div className="flex items-center gap-2">
                                                            <FileText className="w-3 h-3 text-muted-foreground" />
                                                            <span className="text-xs">
                                                              {r.format === "latex" ? "TEX" : r.format.toUpperCase()}
                                                            </span>
                                                            <span className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.5rem" }}>
                                                              {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                                            </span>
                                                          </div>
                                                          <div className="flex items-center gap-2">
                                                            {r.format === "pdf" && (
                                                              <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-5 px-1.5 gap-1 text-[10px]"
                                                                onClick={() => setPreviewResumeId(previewResumeId === r.id ? null : r.id)}
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
                                                {previewResumeId && version.resumes.some((r) => r.id === previewResumeId && r.format === "pdf") && (
                                                  <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                      <p className="text-muted-foreground" style={monoStyle}>PDF Preview</p>
                                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPreviewResumeId(null)}>
                                                        <X className="w-3.5 h-3.5" />
                                                      </Button>
                                                    </div>
                                                    <div className="border border-border rounded-sm overflow-hidden bg-white">
                                                      <iframe
                                                        src={`/api/resume/download/${previewResumeId}?inline=1`}
                                                        className="w-full border-0"
                                                        style={{ height: "80vh", minHeight: "300px" }}
                                                        title="Resume PDF Preview"
                                                      />
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Profile snapshot */}
                                                <VersionPreview snapshot={version.snapshot} />

                                                {/* Delete */}
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="gap-1.5 text-xs text-destructive hover:text-destructive h-7"
                                                  onClick={() => handleDelete(version.id)}
                                                  disabled={deletingId === version.id}
                                                >
                                                  {deletingId === version.id ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                  ) : (
                                                    <Trash2 className="w-3 h-3" />
                                                  )}
                                                  Delete Version
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="py-3 px-3 border border-border/50 rounded-sm text-center">
                                    <p className="text-xs text-muted-foreground">
                                      No optimized versions yet — use the job advisor chat to improve your match score
                                    </p>
                                  </div>
                                )}

                                {/* Unlinked resumes for this job */}
                                {unlinkedResumes.filter((r) => r.job.id === job.id).length > 0 && (
                                  <div>
                                    <p className="text-muted-foreground mb-1.5" style={monoStyle}>
                                      Earlier Resumes · Pre-versioning
                                    </p>
                                    <div className="space-y-1">
                                      {unlinkedResumes
                                        .filter((r) => r.job.id === job.id)
                                        .map((r) => (
                                          <div
                                            key={r.id}
                                            className={`flex items-center justify-between py-1.5 px-2.5 border rounded-sm transition-colors ${
                                              previewResumeId === r.id ? "border-primary bg-primary/5" : "border-border/50"
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <FileText className="w-3 h-3 text-muted-foreground" />
                                              <span className="text-xs">{r.format === "latex" ? "TEX" : r.format.toUpperCase()}</span>
                                              <span className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.5rem" }}>
                                                {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {r.format === "pdf" && (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-5 px-1.5 gap-1 text-[10px]"
                                                  onClick={() => setPreviewResumeId(previewResumeId === r.id ? null : r.id)}
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

                                {/* PDF Preview for unlinked resumes */}
                                {previewResumeId && unlinkedResumes.some((r) => r.id === previewResumeId && r.job.id === job.id && r.format === "pdf") && (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-muted-foreground" style={monoStyle}>PDF Preview</p>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPreviewResumeId(null)}>
                                        <X className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                    <div className="border border-border rounded-sm overflow-hidden bg-white">
                                      <iframe
                                        src={`/api/resume/download/${previewResumeId}?inline=1`}
                                        className="w-full border-0"
                                        style={{ height: "80vh", minHeight: "300px" }}
                                        title="Resume PDF Preview"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Step Indicator ── */

function StepIndicator({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {done ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      ) : (
        <Circle className="w-3 h-3 text-muted-foreground/40" />
      )}
      <span
        className={done ? "text-foreground" : "text-muted-foreground/60"}
        style={{ ...monoStyle, fontSize: "0.5rem" }}
      >
        {label}
      </span>
    </span>
  );
}

/* ── Version Preview ── */

function VersionPreview({ snapshot }: { snapshot: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  } catch {
    return null;
  }

  return (
    <div>
      <p className="text-muted-foreground mb-2" style={monoStyle}>
        Profile Snapshot
      </p>
      <div className="border border-border rounded-sm p-4 space-y-3 bg-card text-sm">
        <div>
          <p className="font-semibold">{data.name}</p>
          {data.email && <p className="text-xs text-muted-foreground">{data.email}</p>}
        </div>

        {data.summary && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{data.summary}</p>
        )}

        {data.experiences && data.experiences.length > 0 && (
          <div>
            <p className="text-xs font-medium text-primary mb-1">Experience</p>
            {data.experiences.slice(0, 3).map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (exp: any, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {exp.title} at {exp.company}
                </p>
              )
            )}
            {data.experiences.length > 3 && (
              <p className="text-[10px] text-muted-foreground">+{data.experiences.length - 3} more</p>
            )}
          </div>
        )}

        {data.skills && (
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(data.skills)
              ? data.skills.slice(0, 10)
              : Object.values(data.skills as Record<string, string[]>).flat().slice(0, 10)
            ).map((s: string | { name: string }, i: number) => (
              <Badge key={i} variant="secondary" className="text-[10px] rounded-sm px-1.5 py-0">
                {typeof s === "string" ? s : s.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
