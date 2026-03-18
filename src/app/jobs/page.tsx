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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Job {
  id: string;
  title: string;
  company: string;
  url?: string;
  description: string;
  skills?: string;
  createdAt: string;
  resumes: Array<{ id: string; format: string }>;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs)
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(payload: { url?: string; description?: string }) {
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
      toast.success(`Added: ${job.title} at ${job.company}`);
    } catch (err) {
      toast.error(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
        <p className="text-muted-foreground mt-1">
          Add job descriptions to generate tailored resumes
        </p>
      </div>

      {/* Add Job */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Add Job</CardTitle>
          <CardDescription>
            Paste a job URL or the full job description. AI will extract the
            role, company, and required skills.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="url">
            <TabsList>
              <TabsTrigger value="url">From URL</TabsTrigger>
              <TabsTrigger value="text">Paste Description</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-3 mt-4">
              <Label>Job Posting URL</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="https://jobs.lever.co/company/..."
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                />
                <Button
                  onClick={() => handleSubmit({ url: jobUrl })}
                  disabled={submitting || !jobUrl}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4"
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
              <Label>Job Description</Label>
              <Textarea
                placeholder="Paste the full job description here..."
                rows={10}
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

      {/* Job List */}
      {jobs.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            Saved Jobs ({jobs.length})
          </h2>
          {jobs.map((job) => (
            <Card key={job.id} className="shadow-sm hover:shadow transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg truncate">
                        {job.title}
                      </h3>
                      {job.resumes.length > 0 && (
                        <Badge>
                          {job.resumes.length} resume
                          {job.resumes.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">{job.company}</p>

                    {job.skills && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {JSON.parse(job.skills)
                          .slice(0, 12)
                          .map((skill: string) => (
                            <Badge
                              key={skill}
                              variant="secondary"
                              className="text-xs"
                            >
                              {skill}
                            </Badge>
                          ))}
                        {JSON.parse(job.skills).length > 12 && (
                          <Badge variant="outline" className="text-xs">
                            +{JSON.parse(job.skills).length - 12} more
                          </Badge>
                        )}
                      </div>
                    )}

                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                      {job.description.slice(0, 200)}...
                    </p>

                    <div className="flex items-center gap-3 mt-3">
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View original
                        </a>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Added{" "}
                        {new Date(job.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <a
                    href={`/generate?jobId=${job.id}`}
                    className={buttonVariants({ size: "sm" })}
                  >
                    Generate Resume
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
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
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">No jobs yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Add a job description above to start generating tailored resumes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
