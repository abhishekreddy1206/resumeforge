"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ExternalLink,
  Sparkles,
  Link,
  FileText,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Target,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Loader2,
  Lightbulb,
  MessageSquare,
  History,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
} from "lucide-react";
import { JobChatPanel } from "@/components/job-chat-panel";

interface Job {
  id: string;
  title: string;
  company: string;
  url?: string;
  description: string;
  skills?: string;
  sponsorship?: string;
  createdAt: string;
  resumes: Array<{ id: string; format: string }>;
  profileVersions?: Array<{ id: string; score: number; delta: number | null; resumes: Array<{ id: string; format: string }> }>;
}

interface MatchResult {
  overallScore: number;
  breakdown: {
    directMatches: string[];
    bridgeableSkills: Array<{
      jobRequirement: string;
      yourSkill: string;
      explanation: string;
    }>;
    gaps: string[];
  };
  resumeTips: Array<{
    priority: number;
    action: string;
    impact: "high" | "medium" | "low";
    grounded: boolean;
  }>;
  skillsToHighlight: string[];
  verdictSummary: string;
}

function JobsSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <Skeleton className="h-10 w-48 mb-4" />
          <Skeleton className="h-10 w-full mb-3" />
          <Skeleton className="h-10 w-28" />
        </CardContent>
      </Card>
      {[1, 2].map((i) => (
        <Card key={i} className="shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex gap-3">
              <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-32 mb-3" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MatchScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
      : score >= 60
        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
        : score >= 40
          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
          : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}
    >
      <Target className="w-3 h-3" />
      {score}%
    </span>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    medium: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${colors[impact] || colors.low}`}
    >
      {impact}
    </span>
  );
}

function MatchPanel({
  match,
  loading,
}: {
  match: MatchResult | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-border/50">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Analyzing profile match...
        </div>
      </div>
    );
  }

  if (!match) return null;

  const { breakdown, resumeTips, skillsToHighlight, verdictSummary } = match;

  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
      {/* Verdict */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {verdictSummary}
      </p>

      {/* Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Direct Matches */}
        <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-3">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Direct Matches ({breakdown.directMatches.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {breakdown.directMatches.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="text-xs border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
              >
                {s}
              </Badge>
            ))}
          </div>
        </div>

        {/* Bridgeable */}
        <div className="rounded-xl border border-blue-200/60 bg-blue-50/30 dark:border-blue-800/40 dark:bg-blue-950/20 p-3">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5 mb-2">
            <ArrowRight className="w-3.5 h-3.5" />
            Bridgeable ({breakdown.bridgeableSkills.length})
          </p>
          {breakdown.bridgeableSkills.length > 0 ? (
            <div className="space-y-1.5">
              {breakdown.bridgeableSkills.map((b) => (
                <div key={b.jobRequirement} className="text-xs">
                  <span className="font-medium">{b.yourSkill}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    → {b.jobRequirement}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">None identified</p>
          )}
        </div>

        {/* Gaps */}
        <div className="rounded-xl border border-red-200/60 bg-red-50/30 dark:border-red-800/40 dark:bg-red-950/20 p-3">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Gaps ({breakdown.gaps.length})
          </p>
          {breakdown.gaps.length > 0 ? (
            <ul className="space-y-1">
              {breakdown.gaps.map((g) => (
                <li key={g} className="text-xs text-muted-foreground">
                  {g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No major gaps!</p>
          )}
        </div>
      </div>

      {/* Skills to Highlight */}
      {skillsToHighlight.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Skills to Emphasize
          </p>
          <div className="flex flex-wrap gap-1.5">
            {skillsToHighlight.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Resume Tips */}
      {resumeTips.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            Resume Tips
          </p>
          <div className="space-y-2">
            {resumeTips.map((tip) => (
              <div
                key={tip.priority}
                className={`flex items-start gap-2.5 text-sm p-2.5 rounded-lg border ${
                  tip.grounded
                    ? "border-border/50 bg-muted/20"
                    : "border-amber-200/50 bg-amber-50/20 dark:border-amber-800/30 dark:bg-amber-950/10"
                }`}
              >
                <ImpactBadge impact={tip.impact} />
                <span className="flex-1 text-xs text-muted-foreground leading-relaxed">
                  {tip.action}
                  {!tip.grounded && (
                    <span className="text-amber-600 dark:text-amber-400 text-[10px] ml-1">
                      (stretch)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type SortField = "title" | "company" | "atsScore" | "resumes" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<
    Record<string, MatchResult>
  >({});
  const [matchLoading, setMatchLoading] = useState<Record<string, boolean>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatJob, setChatJob] = useState<Job | null>(null);
  const [versionSavedForJob, setVersionSavedForJob] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  async function fetchJobs(p: number) {
    const res = await fetch(`/api/jobs?page=${p}&pageSize=${PAGE_SIZE}`);
    if (!res.ok) return;
    const data = await res.json();
    setJobs(data.jobs);
    setTotalJobs(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/jobs?page=1&pageSize=${PAGE_SIZE}`).then((r) => r.json()),
      fetch("/api/profile").then((r) => ({ ok: r.ok })),
    ])
      .then(([j, p]) => {
        setJobs(j.jobs || []);
        setTotalJobs(j.total || 0);
        setTotalPages(j.totalPages || 1);
        setPage(j.page || 1);
        setHasProfile(p.ok);
      })
      .finally(() => setLoading(false));
  }, []);

  // Poll for jobs still being analyzed (title === "Analyzing...")
  useEffect(() => {
    const pendingJobs = jobs.filter((j) => j.title === "Analyzing...");
    if (pendingJobs.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs?page=${page}&pageSize=${PAGE_SIZE}`);
        if (!res.ok) return;
        const data = await res.json();
        const freshJobs: Job[] = data.jobs || [];
        setJobs(freshJobs);
        setTotalJobs(data.total || 0);
        setTotalPages(data.totalPages || 1);

        // Stop polling if no more pending jobs
        const stillPending = freshJobs.some((j) => j.title === "Analyzing...");
        if (!stillPending) clearInterval(interval);
      } catch {
        // silently retry next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, page]);

  async function fetchMatch(jobId: string) {
    if (matchResults[jobId] || matchLoading[jobId]) return;

    setMatchLoading((prev) => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch("/api/jobs/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      setMatchResults((prev) => ({ ...prev, [jobId]: data }));
    } catch (err) {
      toast.error(
        `Match failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setMatchLoading((prev) => ({ ...prev, [jobId]: false }));
    }
  }

  function openChatForJob(job: Job) {
    setChatJob(job);
    setChatOpen(true);
  }

  async function handleGenerateResume(job: Job, format: "pdf" | "docx" | "latex") {
    setGeneratingFor(job.id);
    try {
      // Check if the best version already has a resume in this format
      const bestVersion = job.profileVersions?.[0];
      const body: Record<string, string> = { jobId: job.id, format };
      if (bestVersion) {
        body.profileVersionId = bestVersion.id;
      }

      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      toast.success(`${format.toUpperCase()} resume generated!`);

      // Refresh jobs to update resume counts
      await fetchJobs(page);

      // Auto-download
      window.open(`/api/resume/download/${data.id}`, "_blank");
    } catch (err) {
      toast.error(`Generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setGeneratingFor(null);
    }
  }

  function jobHasResumeFormat(job: Job, format: string): boolean {
    // Check if any version or direct resume already has this format
    if (job.resumes.some((r) => r.format === format)) return true;
    if (job.profileVersions?.some((v) => v.resumes.some((r) => r.format === format))) return true;
    return false;
  }

  function toggleExpand(jobId: string) {
    if (expandedJob === jobId) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobId);
      if (hasProfile) {
        fetchMatch(jobId);
      }
    }
  }

  async function handleSubmit(payload: {
    url?: string;
    description?: string;
  }) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const job = await res.json();
      // Go to page 1 to see the new job, then refresh the list
      await fetchJobs(1);
      setJobUrl("");
      setJobDescription("");
      if (job.analysisStatus === "pending") {
        toast.success("Job added — analyzing in the background...");
      } else {
        toast.success(`Added: ${job.title} at ${job.company}`);
      }
    } catch (err) {
      toast.error(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "atsScore" ? "desc" : "asc");
    }
  }

  function getBestScore(job: Job): number | null {
    const versions = job.profileVersions;
    if (versions && versions.length > 0) return versions[0].score;
    const match = matchResults[job.id];
    if (match) return match.overallScore;
    return null;
  }

  const sortedJobs = [...jobs].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "company":
        return dir * a.company.localeCompare(b.company);
      case "atsScore": {
        const sa = getBestScore(a) ?? -1;
        const sb = getBestScore(b) ?? -1;
        return dir * (sa - sb);
      }
      case "resumes":
        return dir * (a.resumes.length - b.resumes.length);
      case "createdAt":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      default:
        return 0;
    }
  });

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1" />
      : <ArrowDown className="w-3 h-3 ml-1" />;
  }

  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-dm-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    fontWeight: 500,
  };

  if (loading) return <JobsSkeleton />;

  return (
    <div className={`space-y-0 transition-all duration-200 ${chatOpen ? "lg:mr-[420px]" : ""}`}>
      {/* ── Header ── */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Jobs · Saved Positions
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
          Target{" "}
          <span className="text-primary">{totalJobs > 0 ? totalJobs : "your"}</span>{" "}
          {totalJobs === 1 ? "role" : "roles"}
        </h1>
        <div className="section-divider mt-5" />
      </section>

      {/* ── Add Job ── */}
      <section className="py-8 border-b border-border anim-fade-up-1">
        <p className="text-muted-foreground mb-5" style={monoStyle}>
          Add job · Paste URL or description
        </p>
        <Card className="shadow-none border-border rounded-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary/10 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Add Job</CardTitle>
              <CardDescription className="text-xs">
                Paste a job URL or description. AI will extract the role,
                company, and required skills.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="url">
            <TabsList className="w-full sm:w-auto rounded-sm">
              <TabsTrigger value="url" className="flex-1 sm:flex-initial gap-1.5 rounded-sm text-xs">
                <Link className="w-3 h-3" />
                From URL
              </TabsTrigger>
              <TabsTrigger value="text" className="flex-1 sm:flex-initial gap-1.5 rounded-sm text-xs">
                <FileText className="w-3 h-3" />
                Paste Description
              </TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-3 mt-4">
              <Label className="text-sm">Job Posting URL</Label>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Input
                  placeholder="https://jobs.lever.co/company/..."
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={() => handleSubmit({ url: jobUrl })}
                  disabled={submitting || !jobUrl}
                  className="shrink-0"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Analyzing...
                    </span>
                  ) : (
                    "Add Job"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Works best with Lever, Greenhouse, Ashby, and other standard job
                boards
              </p>
            </TabsContent>
            <TabsContent value="text" className="space-y-3 mt-4">
              <Label className="text-sm">Job Description</Label>
              <Textarea
                placeholder="Paste the full job description here..."
                rows={8}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
              <Button
                onClick={() =>
                  handleSubmit({ description: jobDescription })
                }
                disabled={submitting || !jobDescription}
              >
                {submitting ? "Analyzing..." : "Add Job"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </section>

      {/* ── Jobs Table ── */}
      {jobs.length > 0 ? (
        <section className="pt-8 anim-fade-up-2">
          <p className="text-muted-foreground mb-4" style={monoStyle}>
            Saved Jobs · {totalJobs} position{totalJobs !== 1 ? "s" : ""}
            {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
          </p>

          <div className="border border-border rounded-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[280px]">
                    <button onClick={() => handleSort("title")} className="flex items-center text-xs font-medium uppercase tracking-wider">
                      Role <SortIcon field="title" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <button onClick={() => handleSort("company")} className="flex items-center text-xs font-medium uppercase tracking-wider">
                      Company <SortIcon field="company" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[90px] text-center">
                    <button onClick={() => handleSort("atsScore")} className="flex items-center justify-center text-xs font-medium uppercase tracking-wider w-full">
                      ATS <SortIcon field="atsScore" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[80px] text-center hidden md:table-cell">
                    <button onClick={() => handleSort("resumes")} className="flex items-center justify-center text-xs font-medium uppercase tracking-wider w-full">
                      Resumes <SortIcon field="resumes" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[90px] hidden lg:table-cell">
                    <button onClick={() => handleSort("createdAt")} className="flex items-center text-xs font-medium uppercase tracking-wider">
                      Added <SortIcon field="createdAt" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[140px] text-right">
                    <span className="text-xs font-medium uppercase tracking-wider">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedJobs.map((job) => {
                  const isExpanded = expandedJob === job.id;
                  const isAnalyzing = job.title === "Analyzing..." || job.title === "Analysis Failed — Click to Retry";
                  const bestScore = getBestScore(job);
                  const hasVersions = (job.profileVersions?.length ?? 0) > 0;
                  const totalResumes = job.resumes.length + (job.profileVersions?.reduce((acc, v) => acc + v.resumes.length, 0) ?? 0);

                  return (
                    <TableRow
                      key={job.id}
                      className={`group cursor-pointer ${isAnalyzing ? "opacity-60" : ""} ${isExpanded ? "border-b-0" : ""}`}
                      onClick={() => { if (!isAnalyzing) toggleExpand(job.id); }}
                    >
                      {/* Title */}
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 font-bold text-xs ${
                              isAnalyzing
                                ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                                : "bg-primary/8 text-primary"
                            }`}
                            style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "0.9rem" }}
                          >
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : job.company.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                              {job.title === "Analyzing..." ? "Analyzing..." : job.title}
                            </p>
                            <p className="text-xs text-muted-foreground sm:hidden">{job.company}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {job.sponsorship === "available" && (
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              )}
                              {job.sponsorship === "unavailable" && (
                                <ShieldAlert className="w-3 h-3 text-red-500" />
                              )}
                              {job.url && (
                                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              {hasVersions && (
                                <a href="/versions" className="text-primary hover:underline flex items-center gap-0.5 text-[10px]" onClick={(e) => e.stopPropagation()}>
                                  <History className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Company */}
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm">{job.company}</span>
                      </TableCell>

                      {/* ATS Score */}
                      <TableCell className="text-center">
                        {isAnalyzing ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : bestScore !== null ? (
                          <MatchScoreBadge score={bestScore} />
                        ) : hasProfile ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); fetchMatch(job.id); }}
                            className="text-xs text-primary hover:underline"
                          >
                            Score
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Resume Count */}
                      <TableCell className="text-center hidden md:table-cell">
                        {totalResumes > 0 ? (
                          <Badge variant="secondary" className="text-xs">
                            {totalResumes}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {isAnalyzing ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <Loader2 className="w-3 h-3 animate-spin" />
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            {hasProfile && (
                              <Button
                                variant={chatOpen && chatJob?.id === job.id ? "default" : "ghost"}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  if (chatOpen && chatJob?.id === job.id) setChatOpen(false);
                                  else openChatForJob(job);
                                }}
                                title="Resume advisor"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {isExpanded ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setExpandedJob(null)}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => toggleExpand(job.id)}
                                title="Expand details"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                        {versionSavedForJob === job.id && (
                          <a
                            href="/versions"
                            className="flex items-center justify-end gap-1 mt-1 text-[10px] text-emerald-600 hover:underline"
                          >
                            <History className="w-3 h-3" /> Version saved
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Expanded match panel (rendered below table) */}
          {expandedJob && (() => {
            const job = jobs.find((j) => j.id === expandedJob);
            if (!job) return null;
            const match = matchResults[job.id];
            const isMatchLoading = matchLoading[job.id];
            const hasVersions = (job.profileVersions?.length ?? 0) > 0;
            const isGenerating = generatingFor === job.id;
            return (
              <div className="border border-t-0 border-border rounded-b-sm p-5 bg-card -mt-px">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium">{job.title} at {job.company}</p>
                    {match && <MatchScoreBadge score={match.overallScore} />}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedJob(null)}>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {job.skills && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {JSON.parse(job.skills).slice(0, 12).map((skill: string) => (
                      <Badge
                        key={skill}
                        variant="secondary"
                        className={`text-xs ${
                          match?.skillsToHighlight?.includes(skill)
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : ""
                        }`}
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
                <MatchPanel match={match || null} loading={isMatchLoading || false} />

                {/* Generate / Download section */}
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Export Resume
                    </p>
                    {hasVersions && (
                      <a
                        href="/versions"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <History className="w-3 h-3" />
                        View saved versions
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["pdf", "docx", "latex"] as const).map((fmt) => {
                      const alreadyHas = jobHasResumeFormat(job, fmt);
                      const label = fmt === "latex" ? "LaTeX" : fmt.toUpperCase();
                      return (
                        <Button
                          key={fmt}
                          variant={alreadyHas ? "outline" : "default"}
                          size="sm"
                          className="gap-1.5 rounded-sm text-xs"
                          disabled={isGenerating}
                          onClick={() => {
                            if (alreadyHas) {
                              // Find the existing resume to download
                              const existingResume = job.resumes.find((r) => r.format === fmt)
                                || job.profileVersions?.flatMap((v) => v.resumes).find((r) => r.format === fmt);
                              if (existingResume) {
                                window.open(`/api/resume/download/${existingResume.id}`, "_blank");
                              }
                            } else {
                              handleGenerateResume(job, fmt);
                            }
                          }}
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : alreadyHas ? (
                            <Download className="w-3 h-3" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          {alreadyHas ? `Download ${label}` : `Generate ${label}`}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm gap-1"
                disabled={page <= 1}
                onClick={() => fetchJobs(page - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (p === 1 || p === totalPages) return true;
                    if (Math.abs(p - page) <= 1) return true;
                    return false;
                  })
                  .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) {
                      acc.push("ellipsis");
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, i) =>
                    item === "ellipsis" ? (
                      <span key={`e${i}`} className="px-1.5 text-xs text-muted-foreground">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={item}
                        variant={item === page ? "default" : "ghost"}
                        size="sm"
                        className="rounded-sm w-8 h-8 p-0 text-xs"
                        onClick={() => fetchJobs(item as number)}
                      >
                        {item}
                      </Button>
                    )
                  )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm gap-1"
                disabled={page >= totalPages}
                onClick={() => fetchJobs(page + 1)}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {/* Job Chat Panel */}
      <JobChatPanel
        open={chatOpen}
        onOpenChange={setChatOpen}
        job={chatJob}
        matchResult={chatJob ? matchResults[chatJob.id] || null : null}
        onVersionSaved={(jobId) => setVersionSavedForJob(jobId)}
      />
    </div>
  );
}
