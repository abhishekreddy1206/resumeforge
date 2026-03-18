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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface Job {
  id: string;
  title: string;
  company: string;
  skills?: string;
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
}

function GenerateContent() {
  const searchParams = useSearchParams();
  const preselectedJobId = searchParams.get("jobId");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(preselectedJobId || "");
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [generating, setGenerating] = useState(false);
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

  async function handleGenerate() {
    if (!selectedJobId) return;

    setGenerating(true);
    setResult(null);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Generate Resume</h1>
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">No profile found</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Upload your resume first to create a profile, then come back to
              generate tailored resumes.
            </p>
            <a href="/profile" className={buttonVariants()}>
              Upload Resume
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate Resume</h1>
        <p className="text-muted-foreground mt-1">
          Create a tailored resume optimized for a specific job
        </p>
      </div>

      {/* Configuration */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Configure</CardTitle>
          <CardDescription>
            Select a job and output format
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="mb-2 block">Target Job</Label>
            {jobs.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`text-left p-4 rounded-lg border transition-all ${
                      selectedJobId === job.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "hover:border-primary/50 hover:bg-accent/50"
                    }`}
                  >
                    <p className="font-medium">{job.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {job.company}
                    </p>
                    {job.skills && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {JSON.parse(job.skills)
                          .slice(0, 6)
                          .map((s: string) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="text-xs"
                            >
                              {s}
                            </Badge>
                          ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-6 border border-dashed rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  No jobs added yet
                </p>
                <a
                  href="/jobs"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Add a Job
                </a>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <Label className="mb-2 block">Output Format</Label>
            <div className="flex gap-3">
              {(["pdf", "docx"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`px-6 py-3 rounded-lg border font-medium text-sm transition-all ${
                    format === fmt
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "hover:border-primary/50"
                  }`}
                >
                  <span className="block text-lg mb-0.5">
                    {fmt === "pdf" ? "PDF" : "DOCX"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmt === "pdf" ? "Universal format" : "Editable in Word"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedJobId}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Generating with AI... This may take 15-30 seconds
              </span>
            ) : (
              `Generate ${format.toUpperCase()} Resume${selectedJob ? ` for ${selectedJob.company}` : ""}`
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className="shadow-sm overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Resume Generated</CardTitle>
                <CardDescription>
                  Your tailored resume is ready
                </CardDescription>
              </div>
              <a
                href={`/api/resume/download/${result.id}`}
                download
                className={buttonVariants({ size: "lg" })}
              >
                Download {result.format.toUpperCase()}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Saved to: {result.filePath}
            </p>

            {/* Resume Preview */}
            {result.tailoredContent && (
              <div className="border rounded-xl p-8 bg-white space-y-6">
                {/* Header */}
                <div className="text-center border-b pb-4">
                  <h2 className="text-2xl font-bold">
                    {result.tailoredContent.name}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {[
                      result.tailoredContent.email,
                      result.tailoredContent.phone,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                </div>

                {/* Summary */}
                {result.tailoredContent.summary && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
                      Summary
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {result.tailoredContent.summary}
                    </p>
                  </div>
                )}

                {/* Experience */}
                {result.tailoredContent.experiences &&
                  result.tailoredContent.experiences.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">
                        Experience
                      </h3>
                      <div className="space-y-4">
                        {result.tailoredContent.experiences.map((exp, i) => (
                          <div key={i}>
                            <div className="flex justify-between">
                              <div>
                                <p className="font-semibold text-sm">
                                  {exp.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {exp.company}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {exp.startDate} — {exp.endDate || "Present"}
                              </p>
                            </div>
                            <ul className="mt-1.5 space-y-0.5">
                              {exp.bullets.map((b, j) => (
                                <li
                                  key={j}
                                  className="text-xs text-muted-foreground flex gap-1.5"
                                >
                                  <span className="text-primary/50">-</span>
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
                {result.tailoredContent.skills &&
                  Object.keys(result.tailoredContent.skills).length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
                        Skills
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.values(result.tailoredContent.skills)
                          .flat()
                          .map((s) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="text-xs"
                            >
                              {s}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <GenerateContent />
    </Suspense>
  );
}
