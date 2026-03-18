"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

interface Profile {
  id: string;
  name: string;
  email?: string;
  summary?: string;
  skills: Array<{ name: string; category: string }>;
  experiences: Array<{ company: string; title: string }>;
}

interface Job {
  id: string;
  title: string;
  company: string;
  createdAt: string;
  resumes: Array<{ id: string; format: string }>;
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/jobs").then((r) => r.json()),
    ])
      .then(([p, j]) => {
        setProfile(p);
        setJobs(j);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalResumes = jobs.reduce((acc, j) => acc + j.resumes.length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border p-8 md:p-12">
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            {profile ? `Welcome back, ${profile.name.split(" ")[0]}` : "ResumeForge"}
          </h1>
          <p className="text-lg text-muted-foreground mt-3 max-w-2xl">
            AI-powered resume builder for software engineers. Upload your resume,
            add target jobs, and generate perfectly tailored resumes in seconds.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <a href="/profile" className={buttonVariants({ size: "lg" })}>
              {profile ? "View Profile" : "Get Started — Upload Resume"}
            </a>
            {profile && (
              <>
                <a
                  href="/jobs"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Add Job Description
                </a>
                {jobs.length > 0 && (
                  <a
                    href="/generate"
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    Generate Resume
                  </a>
                )}
              </>
            )}
          </div>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Profile Status
                </p>
                <p className="text-3xl font-bold mt-1">
                  {profile ? profile.skills.length : 0}
                </p>
                <p className="text-sm text-muted-foreground">skills tracked</p>
              </div>
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${profile ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground"}`}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Jobs Tracked
                </p>
                <p className="text-3xl font-bold mt-1">{jobs.length}</p>
                <p className="text-sm text-muted-foreground">
                  job descriptions
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Resumes Generated
                </p>
                <p className="text-3xl font-bold mt-1">{totalResumes}</p>
                <p className="text-sm text-muted-foreground">
                  tailored resumes
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How it Works - shown when no profile */}
      {!profile && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>How it Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: "1",
                  title: "Upload Your Resume",
                  desc: "Upload a PDF or DOCX resume. Our AI extracts your experience, skills, projects, and education into a structured profile.",
                },
                {
                  step: "2",
                  title: "Add Target Jobs",
                  desc: "Paste a job URL or description. AI analyzes the requirements, skills needed, and seniority level.",
                },
                {
                  step: "3",
                  title: "Generate Tailored Resume",
                  desc: "AI creates a perfectly tailored resume highlighting your most relevant experience for each specific role.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Jobs</CardTitle>
            <a
              href="/jobs"
              className="text-sm text-primary hover:underline font-medium"
            >
              View all
            </a>
          </CardHeader>
          <CardContent>
            {jobs.length > 0 ? (
              <div className="space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <a
                    key={job.id}
                    href={`/generate?jobId=${job.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors group"
                  >
                    <div>
                      <p className="font-medium group-hover:text-primary transition-colors">
                        {job.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {job.company}
                      </p>
                    </div>
                    {job.resumes.length > 0 && (
                      <Badge variant="secondary">
                        {job.resumes.length} resume
                        {job.resumes.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No jobs added yet.{" "}
                <a href="/jobs" className="text-primary hover:underline">
                  Add your first job
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Skills Overview */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Skills</CardTitle>
            <a
              href="/skills"
              className="text-sm text-primary hover:underline font-medium"
            >
              View all
            </a>
          </CardHeader>
          <CardContent>
            {profile && profile.skills.length > 0 ? (
              <div className="space-y-3">
                {Object.entries(
                  profile.skills.reduce(
                    (acc, s) => {
                      if (!acc[s.category]) acc[s.category] = [];
                      acc[s.category].push(s.name);
                      return acc;
                    },
                    {} as Record<string, string[]>
                  )
                )
                  .slice(0, 4)
                  .map(([cat, skills]) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        {cat}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {skills.slice(0, 8).map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {skills.length > 8 && (
                          <Badge
                            variant="secondary"
                            className="text-xs"
                          >
                            +{skills.length - 8}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No skills yet.{" "}
                <a href="/profile" className="text-primary hover:underline">
                  Upload a resume
                </a>{" "}
                to get started.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
