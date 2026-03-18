"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Loader2,
  Lightbulb,
} from "lucide-react";

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

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
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

  useEffect(() => {
    Promise.all([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/profile").then((r) => ({ ok: r.ok })),
    ])
      .then(([j, p]) => {
        setJobs(j);
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
        const res = await fetch("/api/jobs");
        if (!res.ok) return;
        const freshJobs: Job[] = await res.json();
        setJobs(freshJobs);

        // Stop polling if no more pending jobs
        const stillPending = freshJobs.some((j) => j.title === "Analyzing...");
        if (!stillPending) clearInterval(interval);
      } catch {
        // silently retry next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs]);

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
      setJobs((prev) => [job, ...prev]);
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

  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-dm-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    fontWeight: 500,
  };

  if (loading) return <JobsSkeleton />;

  return (
    <div className="space-y-0">
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
          <span className="text-primary">{jobs.length > 0 ? jobs.length : "your"}</span>{" "}
          {jobs.length === 1 ? "role" : jobs.length > 1 ? "roles" : "roles"}
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

      {/* ── Job List ── */}
      {jobs.length > 0 ? (
        <section className="pt-8 space-y-3 anim-fade-up-2">
          <p className="text-muted-foreground mb-4" style={monoStyle}>
            Saved Jobs · {jobs.length} position{jobs.length !== 1 ? "s" : ""}
          </p>
          {jobs.map((job) => {
            const isExpanded = expandedJob === job.id;
            const match = matchResults[job.id];
            const isMatchLoading = matchLoading[job.id];
            const isAnalyzing = job.title === "Analyzing..." || job.title === "Analysis Failed — Click to Retry";

            return (
              <Card
                key={job.id}
                className={`shadow-sm hover:shadow transition-shadow ${isAnalyzing ? "opacity-80" : ""}`}
              >
                <CardContent className="pt-5 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${isAnalyzing ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400" : "bg-primary/8 text-primary"}`}>
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : job.company.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`font-semibold text-sm sm:text-base ${isAnalyzing ? "text-muted-foreground" : ""}`}>
                            {job.title === "Analyzing..." ? "Analyzing job posting..." : job.title}
                          </h3>
                          {match && <MatchScoreBadge score={match.overallScore} />}
                          {job.resumes.length > 0 && (
                            <Badge className="text-xs">
                              {job.resumes.length} resume
                              {job.resumes.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {job.sponsorship === "unavailable" && (
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                            >
                              <ShieldAlert className="w-3 h-3" />
                              No Sponsorship
                            </Badge>
                          )}
                          {job.sponsorship === "available" && (
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Sponsors Visa
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {job.company}
                        </p>

                        {job.skills && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {JSON.parse(job.skills)
                              .slice(0, 8)
                              .map((skill: string) => (
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
                            {JSON.parse(job.skills).length > 8 && (
                              <Badge variant="outline" className="text-xs">
                                +{JSON.parse(job.skills).length - 8} more
                              </Badge>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {job.description.slice(0, 200)}...
                        </p>

                        <div className="flex items-center gap-3 mt-2">
                          {job.url && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View original
                            </a>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Added{" "}
                            {new Date(job.createdAt).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" }
                            )}
                          </span>
                          {hasProfile && !isAnalyzing && (
                            <button
                              onClick={() => toggleExpand(job.id)}
                              className="text-xs text-primary hover:underline flex items-center gap-1 ml-auto"
                            >
                              <Target className="w-3 h-3" />
                              {isExpanded ? "Hide" : "Match"} Analysis
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>

                        {/* Match Analysis Panel */}
                        {isExpanded && (
                          <MatchPanel
                            match={match || null}
                            loading={isMatchLoading || false}
                          />
                        )}
                      </div>
                    </div>

                    {isAnalyzing ? (
                      <div className="shrink-0 w-full sm:w-auto text-center">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {job.title === "Analysis Failed — Click to Retry" ? "Analysis failed" : "Analyzing..."}
                        </span>
                      </div>
                    ) : (
                      <a
                        href={`/generate?jobId=${job.id}`}
                        className={buttonVariants({
                          size: "sm",
                          className: "shrink-0 w-full sm:w-auto gap-1.5 rounded-sm",
                        })}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate Resume
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
