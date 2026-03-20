"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap,
  Briefcase,
  FileText,
  Upload,
  Search,
  Sparkles,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

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

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="border-b border-border pb-10 pt-2">
        <Skeleton className="h-3 w-20 mb-8" />
        <Skeleton className="h-16 w-80 mb-4" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-sm" />
          <Skeleton className="h-10 w-28 rounded-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-0 border-b border-border pb-10">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`${i > 1 ? "border-l border-border" : ""} px-6 first:pl-0`}>
            <Skeleton className="h-12 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/jobs?pageSize=50").then((r) => r.json()),
    ])
      .then(([p, j]) => {
        setProfile(p);
        setJobs(j.jobs || j);
        if (p) {
          fetch("/api/profile/refresh", { method: "POST" })
            .then((r) => r.json())
            .then((data) => {
              if (data.refreshed) {
                console.log("[dashboard] Background profile refresh triggered for:", data.sources);
              }
            })
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const totalResumes = jobs.reduce((acc, j) => acc + j.resumes.length, 0);

  if (loading) return <DashboardSkeleton />;

  const stats = [
    {
      label: "Skills Tracked",
      value: profile ? profile.skills.length : 0,
      icon: Zap,
    },
    {
      label: "Jobs Saved",
      value: jobs.length,
      icon: Briefcase,
    },
    {
      label: "Resumes Made",
      value: totalResumes,
      icon: FileText,
    },
  ];

  // Group skills by category for overview
  const skillsByCategory = profile?.skills.reduce(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s.name);
      return acc;
    },
    {} as Record<string, string[]>
  ) ?? {};

  return (
    <div className="space-y-0">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Dashboard · AI Resume Builder
        </p>

        <h1
          className="text-foreground leading-none mb-5"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: "clamp(3rem, 8vw, 5.5rem)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          {profile ? (
            <>
              Welcome back,{" "}
              <span className="text-primary">
                {profile.name.split(" ")[0]}
              </span>
            </>
          ) : (
            <>
              Forge your{" "}
              <span className="text-primary">perfect</span>
              {" "}resume
            </>
          )}
        </h1>

        {/* Accent rule */}
        <div className="section-divider mb-5" />

        <p className="text-muted-foreground text-sm sm:text-base max-w-xl mb-7 leading-relaxed">
          Upload your resume, add target jobs, and generate tailored
          ATS-optimized resumes — shaped by AI, written for humans.
        </p>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
          <a
            href="/profile"
            className={buttonVariants({ size: "default", className: "gap-2 rounded-sm" })}
          >
            {profile ? "View Profile" : "Get Started"}
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
          {profile && (
            <>
              <a
                href="/jobs"
                className={buttonVariants({
                  variant: "outline",
                  size: "default",
                  className: "gap-2 rounded-sm",
                })}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Add Job
              </a>
              {jobs.length > 0 && (
                <a
                  href="/jobs"
                  className={buttonVariants({
                    variant: "outline",
                    size: "default",
                    className: "gap-2 rounded-sm",
                  })}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Resume
                </a>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Stats — typographic display ──────────────────── */}
      <section className="grid grid-cols-3 border-b border-border py-10 anim-fade-up-1">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`${i > 0 ? "border-l border-border" : ""} px-4 sm:px-8 first:pl-0 overflow-hidden`}
            >
              <div className="flex items-start gap-2 mb-1">
                <p
                  className="text-foreground leading-none"
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontStyle: "italic",
                    fontSize: "clamp(1.75rem, 6vw, 4rem)",
                    fontWeight: 400,
                  }}
                >
                  {stat.value}
                </p>
              </div>
              <p className="text-muted-foreground flex items-center gap-1.5" style={monoStyle}>
                <Icon className="w-2.5 h-2.5" />
                {stat.label}
              </p>
            </div>
          );
        })}
      </section>

      {/* ── How it Works (new users) ─────────────────────── */}
      {!profile && (
        <section className="border-b border-border py-10 anim-fade-up-2">
          <p className="text-muted-foreground mb-6" style={monoStyle}>
            How it works
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
            {[
              {
                num: "01",
                icon: Upload,
                title: "Upload Resume",
                desc: "Upload a PDF or DOCX. AI extracts your experience, skills, and education into a structured profile.",
              },
              {
                num: "02",
                icon: Search,
                title: "Add Target Jobs",
                desc: "Paste a job URL or description. AI analyzes requirements, skills, and seniority level.",
              },
              {
                num: "03",
                icon: Sparkles,
                title: "Generate",
                desc: "AI creates a tailored resume highlighting your most relevant experience for each role.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-5">
                  <div>
                    <p
                      className="text-primary leading-none mb-3"
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontStyle: "italic",
                        fontSize: "2.5rem",
                        fontWeight: 300,
                      }}
                    >
                      {item.num}
                    </p>
                    <div className="w-8 h-8 bg-primary/8 flex items-center justify-center mb-3">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1.5">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Two-column: Jobs + Skills ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 pt-10 anim-fade-up-3">
        {/* Recent Jobs */}
        <div className="lg:border-r lg:border-border lg:pr-10 pb-10 lg:pb-0">
          <div className="flex items-center justify-between mb-6">
            <p className="text-muted-foreground" style={monoStyle}>
              Recent Jobs
            </p>
            <a
              href="/jobs"
              className="text-primary flex items-center gap-1 transition-opacity hover:opacity-70"
              style={monoStyle}
            >
              View all
              <ChevronRight className="w-3 h-3" />
            </a>
          </div>

          {jobs.length > 0 ? (
            <div className="space-y-0">
              {jobs.slice(0, 5).map((job, i) => (
                <a
                  key={job.id}
                  href="/jobs"
                  className={`flex items-center justify-between py-3.5 group transition-colors hover:text-primary ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center shrink-0 font-bold"
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontStyle: "italic",
                        fontSize: "1rem",
                      }}
                    >
                      {job.company.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {job.title}
                      </p>
                      <p className="text-muted-foreground truncate" style={{ ...monoStyle, fontSize: "0.6rem" }}>
                        {job.company}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.resumes.length > 0 && (
                      <Badge variant="secondary" className="text-xs rounded-sm">
                        {job.resumes.length}
                      </Badge>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Briefcase
                className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3"
                strokeWidth={1.5}
              />
              <p className="text-sm text-muted-foreground">
                No jobs added yet.{" "}
                <a href="/jobs" className="text-primary hover:underline">
                  Add your first job
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Skills Overview */}
        <div className="lg:pl-10 border-t border-border pt-10 lg:border-t-0 lg:pt-0">
          <div className="flex items-center justify-between mb-6">
            <p className="text-muted-foreground" style={monoStyle}>
              Skills Overview
            </p>
            <a
              href="/skills"
              className="text-primary flex items-center gap-1 transition-opacity hover:opacity-70"
              style={monoStyle}
            >
              View all
              <ChevronRight className="w-3 h-3" />
            </a>
          </div>

          {profile && profile.skills.length > 0 ? (
            <div className="space-y-5">
              {Object.entries(skillsByCategory)
                .slice(0, 4)
                .map(([cat, skills]) => (
                  <div key={cat}>
                    <p
                      className="text-muted-foreground mb-2"
                      style={monoStyle}
                    >
                      {cat}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.slice(0, 8).map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="text-xs rounded-sm"
                        >
                          {s}
                        </Badge>
                      ))}
                      {skills.length > 8 && (
                        <Badge variant="secondary" className="text-xs rounded-sm">
                          +{skills.length - 8}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Zap
                className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3"
                strokeWidth={1.5}
              />
              <p className="text-sm text-muted-foreground">
                No skills yet.{" "}
                <a href="/profile" className="text-primary hover:underline">
                  Upload a resume
                </a>{" "}
                to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
