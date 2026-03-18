"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  FileText,
  FileSpreadsheet,
  Code2,
  CheckCircle2,
  Download,
  Sparkles,
  Loader2,
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  company: string;
  skills?: string;
}

interface CritiquePerspective {
  perspective: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
}

interface CritiqueDimension {
  dimension: string;
  weight: number;
  score: number;
  feedback: string;
}

interface Critique {
  perspectives: CritiquePerspective[];
  dimensions: CritiqueDimension[];
  overallScore: number;
  atsKeywordMatchRate: number;
  aiFingerprints: string[];
  topImprovements: Array<{
    priority: number;
    change: string;
    pointImpact: number;
  }>;
  verdict: string;
}

interface GeneratedResume {
  id: string;
  format: string;
  filePath: string;
  tailoredContent: {
    name: string;
    email?: string;
    phone?: string;
    summary?: string;
    experiences?: Array<{
      company: string;
      title: string;
      startDate: string;
      endDate?: string;
      bullets: string[];
    }>;
    educations?: Array<{
      school: string;
      degree: string;
      field?: string;
      endDate?: string;
    }>;
    projects?: Array<{
      name: string;
      description?: string;
    }>;
    skills?: Record<string, string[]>;
  };
  critique?: Critique;
}

type FormatOption = "pdf" | "docx" | "latex";

const FORMAT_INFO: Record<
  FormatOption,
  { label: string; desc: string; icon: typeof FileText }
> = {
  pdf: { label: "PDF", desc: "Universal format", icon: FileText },
  docx: { label: "DOCX", desc: "Editable in Word", icon: FileSpreadsheet },
  latex: { label: "LaTeX", desc: "Beautiful typesetting", icon: Code2 },
};

const PROGRESS_STEPS = [
  "Analyzing your profile...",
  "Matching skills to job requirements...",
  "Crafting tailored content...",
  "Optimizing for ATS...",
  "Running quality critique...",
];

const scoreMono: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.65rem",
  letterSpacing: "0.08em",
  fontWeight: 500,
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85
      ? "text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-700"
      : score >= 80
        ? "text-blue-700 border-blue-300 dark:text-blue-300 dark:border-blue-700"
        : score >= 75
          ? "text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-700"
          : "text-red-700 border-red-300 dark:text-red-300 dark:border-red-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm border ${color}`}
      style={scoreMono}
    >
      {score}
    </span>
  );
}

const critiqueMonoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

function CritiqueSection({ critique }: { critique: Critique }) {
  const verdictLabels: Record<string, { label: string; color: string }> = {
    submit: { label: "Ready to Submit", color: "text-emerald-700 border-emerald-300" },
    strong: { label: "Strong", color: "text-blue-700 border-blue-300" },
    needs_work: { label: "Needs Work", color: "text-amber-700 border-amber-300" },
    fundamental_issues: { label: "Major Rework", color: "text-red-700 border-red-300" },
  };

  const verdict = verdictLabels[critique.verdict] || verdictLabels.needs_work;

  return (
    <div className="border border-border">
      {/* Header */}
      <div className="border-b border-border px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-muted-foreground" style={critiqueMonoStyle}>
            AI Critique · Multi-perspective review
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={critique.overallScore} />
          <span
            className={`px-2 py-0.5 rounded-sm border ${verdict.color}`}
            style={critiqueMonoStyle}
          >
            {verdict.label}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* ATS Match Rate */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground" style={critiqueMonoStyle}>
              ATS Keyword Match
            </p>
            <p className="text-muted-foreground" style={critiqueMonoStyle}>
              {critique.atsKeywordMatchRate}%
            </p>
          </div>
          <div className="h-1 bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${critique.atsKeywordMatchRate >= 70 ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${Math.min(critique.atsKeywordMatchRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Perspective Scores */}
        <div>
          <p className="text-muted-foreground mb-3" style={critiqueMonoStyle}>
            Perspectives
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {critique.perspectives.map((p) => (
              <div
                key={p.perspective}
                className="flex items-center justify-between px-3 py-2 border border-border"
              >
                <span className="text-sm">{p.perspective}</span>
                <ScoreBadge score={p.score} />
              </div>
            ))}
          </div>
        </div>

        {/* Top Improvements */}
        {critique.topImprovements && critique.topImprovements.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-3" style={critiqueMonoStyle}>
              Top Improvements
            </p>
            <div className="space-y-2">
              {critique.topImprovements.slice(0, 3).map((imp) => (
                <div key={imp.priority} className="flex items-start gap-3 text-sm">
                  <span className="text-primary shrink-0" style={{ ...critiqueMonoStyle, fontSize: "0.65rem" }}>
                    +{imp.pointImpact}pts
                  </span>
                  <span className="text-muted-foreground text-xs leading-relaxed">{imp.change}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Fingerprints */}
        {critique.aiFingerprints && critique.aiFingerprints.length > 0 && (
          <div>
            <p className="mb-2" style={{ ...critiqueMonoStyle, color: "#b45309" }}>
              AI Fingerprints Detected
            </p>
            <div className="space-y-1">
              {critique.aiFingerprints.map((f, i) => (
                <p key={i} className="text-xs text-muted-foreground">– {f}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GenerateContent() {
  const searchParams = useSearchParams();
  const preselectedJobId = searchParams.get("jobId");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(preselectedJobId || "");
  const [format, setFormat] = useState<FormatOption>("pdf");
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [result, setResult] = useState<GeneratedResume | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/profile").then((r) => ({ ok: r.ok })),
    ])
      .then(([j, p]) => {
        setJobs(j);
        setHasProfile(p.ok);
        if (preselectedJobId) setSelectedJobId(preselectedJobId);
      })
      .finally(() => setLoading(false));
  }, [preselectedJobId]);

  // Progress step animation during generation
  useEffect(() => {
    if (!generating) {
      setProgressStep(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressStep((prev) =>
        prev < PROGRESS_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 5000);
    return () => clearInterval(interval);
  }, [generating]);

  // Poll for critique when result has pending critique
  useEffect(() => {
    if (!result || result.critique || !result.id) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/resume/generate?resumeId=${result.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "done" && data.critique) {
          setResult((prev) => prev ? { ...prev, critique: data.critique } : prev);
          toast.success("AI critique ready!");
          clearInterval(interval);
        } else if (data.status === "error") {
          clearInterval(interval);
        }
      } catch {
        // retry next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [result]);

  async function handleGenerate() {
    if (!selectedJobId) return;

    setGenerating(true);
    setResult(null);
    setProgressStep(0);
    try {
      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId, format }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      setResult(data);
      toast.success("Resume generated!");
    } catch (err) {
      toast.error(
        `Generation failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setGenerating(false);
    }
  }

  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-dm-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    fontWeight: 500,
  };

  if (loading) {
    return (
      <div className="space-y-0">
        <div className="border-b border-border pb-10 pt-2">
          <Skeleton className="h-3 w-20 mb-8" />
          <Skeleton className="h-14 w-64 mb-4" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="pt-8 space-y-4">
          <Skeleton className="h-16 w-full rounded-sm" />
          <Skeleton className="h-16 w-full rounded-sm" />
          <Skeleton className="h-10 w-full rounded-sm" />
        </div>
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <div className="space-y-0">
        <div className="border-b border-border pb-10 pt-2 anim-fade-up">
          <p className="text-muted-foreground mb-6" style={monoStyle}>Generate</p>
          <h1
            className="text-foreground leading-none mb-5"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 400,
            }}
          >
            No profile found
          </h1>
          <div className="section-divider mb-5" />
          <p className="text-muted-foreground text-sm mb-6 max-w-sm leading-relaxed">
            Upload your resume first to create a profile, then come back to generate
            tailored resumes.
          </p>
          <a href="/profile" className={buttonVariants({ className: "rounded-sm" })}>
            Upload Resume
          </a>
        </div>
      </div>
    );
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <div className="space-y-0">
      {/* ── Header ── */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Generate · Tailored Resume
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
          Craft your{" "}
          <span className="text-primary">perfect</span> resume
        </h1>
        <div className="section-divider mt-5" />
      </section>

      {/* ── Configuration ── */}
      <section className="py-8 border-b border-border anim-fade-up-1">
        <div className="space-y-8">
          {/* Target Job */}
          <div>
            <p className="text-muted-foreground mb-4" style={monoStyle}>
              01 · Target Job
            </p>
            {jobs.length > 0 ? (
              <div className="space-y-0">
                {jobs.map((job, i) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full text-left flex items-center gap-4 py-3.5 transition-colors border-t border-border ${
                      i === jobs.length - 1 ? "border-b" : ""
                    } ${
                      selectedJobId === job.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 flex items-center justify-center shrink-0 font-bold text-sm transition-colors ${
                        selectedJobId === job.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontStyle: "italic",
                        fontSize: "1rem",
                      }}
                    >
                      {job.company.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${selectedJobId === job.id ? "text-primary" : ""}`}>
                        {job.title}
                      </p>
                      <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.6rem" }}>
                        {job.company}
                      </p>
                    </div>
                    {selectedJobId === job.id && (
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-8 border border-border text-center">
                <p className="text-sm text-muted-foreground mb-3">No jobs added yet</p>
                <a href="/jobs" className={buttonVariants({ variant: "outline", size: "sm", className: "rounded-sm" })}>
                  Add a Job
                </a>
              </div>
            )}
          </div>

          {/* Output Format */}
          <div>
            <p className="text-muted-foreground mb-4" style={monoStyle}>
              02 · Output Format
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(FORMAT_INFO) as FormatOption[]).map((fmt) => {
                const info = FORMAT_INFO[fmt];
                const Icon = info.icon;
                return (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt)}
                    className={`py-4 px-3 border transition-all flex flex-col items-center gap-2 rounded-sm ${
                      format === fmt
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${format === fmt ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span
                      className={format === fmt ? "text-primary" : "text-muted-foreground"}
                      style={monoStyle}
                    >
                      {info.label}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {info.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedJobId}
            className="w-full rounded-sm"
            size="lg"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {PROGRESS_STEPS[progressStep]}
              </span>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate {FORMAT_INFO[format].label} Resume
                {selectedJob ? ` for ${selectedJob.company}` : ""}
              </>
            )}
          </Button>
        </div>
      </section>

      {/* ── Result ── */}
      {result && (
        <section className="pt-8 space-y-6 anim-fade-up">
          {/* Success banner */}
          <div className="border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">Resume Generated</p>
                <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.58rem" }}>
                  Your tailored resume is ready to download
                </p>
              </div>
            </div>
            <a
              href={`/api/resume/download/${result.id}`}
              download
              className={buttonVariants({ size: "sm", className: "gap-1.5 rounded-sm shrink-0" })}
            >
              <Download className="w-3.5 h-3.5" />
              Download {result.format === "latex" ? "TEX" : result.format.toUpperCase()}
            </a>
          </div>

          {/* Resume Preview */}
          {result.tailoredContent && (
            <div className="border border-border p-6 sm:p-10 bg-card space-y-6">
              {/* Header */}
              <div className="text-center border-b border-border pb-5">
                <h2
                  className="text-foreground"
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontStyle: "italic",
                    fontSize: "2rem",
                    fontWeight: 400,
                  }}
                >
                  {result.tailoredContent.name}
                </h2>
                <p className="text-muted-foreground mt-1" style={monoStyle}>
                  {[result.tailoredContent.email, result.tailoredContent.phone]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
              </div>

              {/* Summary */}
              {result.tailoredContent.summary && (
                <div>
                  <p className="text-primary mb-2" style={monoStyle}>Summary</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {result.tailoredContent.summary}
                  </p>
                </div>
              )}

              {/* Experience */}
              {result.tailoredContent.experiences && result.tailoredContent.experiences.length > 0 && (
                <div>
                  <p className="text-primary mb-3" style={monoStyle}>Experience</p>
                  <div className="space-y-4">
                    {result.tailoredContent.experiences.map((exp, i) => (
                      <div key={i}>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 mb-1.5">
                          <div>
                            <p className="font-semibold text-sm">{exp.title}</p>
                            <p className="text-xs text-muted-foreground">{exp.company}</p>
                          </div>
                          <p className="text-muted-foreground shrink-0" style={{ ...monoStyle, fontSize: "0.58rem" }}>
                            {exp.startDate} — {exp.endDate || "Present"}
                          </p>
                        </div>
                        <ul className="space-y-0.5">
                          {exp.bullets.map((b, j) => (
                            <li key={j} className="text-xs text-muted-foreground flex gap-2">
                              <span className="text-primary shrink-0 mt-0.5">–</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {result.tailoredContent.skills && Object.keys(result.tailoredContent.skills).length > 0 && (
                <div>
                  <p className="text-primary mb-2" style={monoStyle}>Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(result.tailoredContent.skills).flat().map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs rounded-sm">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Critique */}
          {result.critique ? (
            <CritiqueSection critique={result.critique} />
          ) : (
            <div className="border border-border p-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Running AI critique in the background...
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 sm:space-y-8">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Card className="shadow-sm">
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
      }
    >
      <GenerateContent />
    </Suspense>
  );
}
