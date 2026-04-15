"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/analytics/stat-card";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { SkillGapChart } from "@/components/analytics/skill-gap-chart";
import { ATSTrendChart } from "@/components/analytics/ats-trend-chart";
import {
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  TrendingUp,
  User,
  ArrowRight,
} from "lucide-react";

interface Skill {
  id: string;
  name: string;
  category: string;
}

interface Experience {
  id: string;
  company: string;
  title: string;
}

interface Profile {
  id: string;
  name: string;
  email?: string;
  skills: Skill[];
  experiences: Experience[];
}

interface Job {
  id: string;
  title: string;
  company: string;
  applied: boolean;
  resumes: { id: string }[];
}

interface AnalyticsData {
  funnel: {
    totalJobs: number;
    matchedJobs: number;
    optimizedJobs: number;
    appliedJobs: number;
    weeklyAdded: number;
  };
  skillGaps: Array<{
    skill: string;
    frequency: number;
    status: "strong" | "partial" | "gap";
    profileSkill?: string;
  }>;
  matchTrends: {
    averageScore: number;
    jobCount: number;
    strongFitCount: number;
    distribution: Array<{ range: string; count: number }>;
  };
  resumeQualityTrends: {
    averageQuality: number;
    averageDelta: number;
    jobCount: number;
    distribution: Array<{ range: string; count: number }>;
  };
  qualityHealth: {
    evaluatedResumeCount: number;
    hardGroundingViolationRate: number;
    softWarningRate: number;
    averageWarningsPerGeneratedResume: number;
    pageBudgetOverflowRate: number;
    averageQualityByRoleArchetype: Array<{ roleArchetype: string; averageQuality: number; count: number }>;
    shareOfJobsWithValidV2Resumes: number;
  };
  tokenUsage: {
    daily: Array<{ day: string; cost: number; inputTokens: number; outputTokens: number; calls: number }>;
    totals: { cost: number; inputTokens: number; outputTokens: number; calls: number };
    bySkill: Array<{ skill: string; cost: number; inputTokens: number; outputTokens: number; calls: number; cacheReads: number; cacheCreations: number }>;
    byModel: Array<{ model: string; cost: number; calls: number }>;
  };
  versions: Array<{
    id: string;
    score: number;
    delta: number | null;
    label: string | null;
    createdAt: string;
    job: { id: string; title: string; company: string };
    resumes: Array<{ id: string; format: string; createdAt: string }>;
  }>;
  resumeCount: number;
  insights: {
    realisticJobs: number;
    clusterCount: number;
    gapCount: number;
    avgScore: number;
    topFinding: string | null;
    coveredStudyTopics: number;
    uncoveredStudyTopics: number;
  };
  learn: {
    totalGuides: number;
    completedGuides: number;
    inProgressGuides: number;
    totalPaths: number;
    savedSources: number;
  };
  sourceHealth: {
    needsReview: number;
    domFallback: number;
    staleGuideAttachments: number;
    guidesWithStaleSources: number;
    manualEdits: number;
  };
  capture: {
    jobsBySource: Array<{ source: string; count: number }>;
    placeholderJobs: number;
  };
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-lg" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

function MiniBarChart({ data }: { data: Array<{ day: string; cost: number }> }) {
  const maxCost = Math.max(...data.map((d) => d.cost), 0.001);
  return (
    <div className="flex items-end gap-px h-24">
      {data.map((d) => (
        <div
          key={d.day}
          className="flex-1 bg-primary/60 hover:bg-primary rounded-t transition-colors cursor-pointer group relative"
          style={{ height: `${(d.cost / maxCost) * 100}%`, minHeight: d.cost > 0 ? "2px" : "0px" }}
          title={`${d.day}: $${d.cost.toFixed(4)}`}
        />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiUsageOpen, setAiUsageOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/jobs?pageSize=5").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/analytics").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, j, a]) => {
        setProfile(p);
        setJobs(Array.isArray(j) ? j : (j?.jobs ?? []));
        setAnalytics(a);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <DashboardSkeleton />
      </div>
    );
  }

  const firstName = profile?.name?.split(" ")[0];
  const hasProfile = !!profile;
  const hasJobs = jobs.length > 0;
  const hasAnalytics = !!analytics;

  const skillsByCategory: Record<string, Skill[]> = {};
  if (profile?.skills) {
    for (const skill of profile.skills) {
      const cat = skill.category || "other";
      if (!skillsByCategory[cat]) skillsByCategory[cat] = [];
      skillsByCategory[cat].push(skill);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Hero */}
      <section>
        <h1 className="text-2xl font-bold tracking-tight">
          {firstName ? `Welcome back, ${firstName}` : "Welcome to ResumeForge"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasProfile ? "Your job search command center" : "AI-powered resume tailoring for every job application"}
        </p>
        {!hasProfile && (
          <div className="mt-4 flex gap-3">
            <a href="/profile" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
              <User className="w-4 h-4" /> Get Started
            </a>
          </div>
        )}
        {hasProfile && !hasJobs && (
          <div className="mt-4">
            <a href="/jobs" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
              <Briefcase className="w-4 h-4" /> Add Your First Job
            </a>
          </div>
        )}
      </section>

      {/* How it Works (new users only) */}
      {!hasProfile && (
        <section className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">How it Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Upload Resume", desc: "Upload your PDF or DOCX resume. AI parses it into a structured profile." },
              { step: "2", title: "Add Jobs", desc: "Paste job URLs or descriptions. AI extracts requirements and scores your fit." },
              { step: "3", title: "Generate", desc: "Generate tailored resumes optimized for each job's ATS keywords." },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="text-2xl font-bold text-primary/30 font-mono">{item.step}</div>
                <div>
                  <div className="font-medium text-sm">{item.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hero Stats */}
      {hasAnalytics && (
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="Active Jobs"
            value={analytics.funnel.totalJobs - analytics.funnel.appliedJobs}
            trend={`+${analytics.funnel.weeklyAdded} this week`}
            trendColor="text-green-500"
          />
          <StatCard
            label="Applied"
            value={analytics.funnel.appliedJobs}
            trend={analytics.funnel.totalJobs > 0 ? `${Math.round((analytics.funnel.appliedJobs / analytics.funnel.totalJobs) * 100)}% of total` : ""}
          />
          <StatCard
            label="Avg Match Score"
            value={analytics.matchTrends.averageScore || "—"}
            trend={analytics.matchTrends.jobCount > 0 ? `${analytics.matchTrends.strongFitCount} strong-fit jobs` : ""}
          />
          <StatCard
            label="Avg Resume Quality"
            value={analytics.resumeQualityTrends.averageQuality || "—"}
            trend={
              analytics.resumeQualityTrends.jobCount > 0
                ? `${analytics.resumeQualityTrends.averageDelta >= 0 ? "+" : ""}${analytics.resumeQualityTrends.averageDelta} pts avg v2 delta`
                : ""
            }
            trendColor="text-green-500"
          />
          <StatCard
            label="Resumes Generated"
            value={analytics.resumeCount}
          />
        </section>
      )}

      {/* Funnel */}
      {hasAnalytics && analytics.funnel.totalJobs > 0 && (
        <section>
          <FunnelChart data={analytics.funnel} />
        </section>
      )}

      {/* Two-column insights */}
      {hasAnalytics && (analytics.skillGaps.length > 0 || analytics.resumeQualityTrends.jobCount > 0) && (
        <section className="grid md:grid-cols-2 gap-4">
          {analytics.skillGaps.length > 0 && <SkillGapChart data={analytics.skillGaps} />}
          {analytics.resumeQualityTrends.jobCount > 0 && <ATSTrendChart data={analytics.resumeQualityTrends} />}
        </section>
      )}

      {hasAnalytics && (
        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-card border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-1">Learn &amp; Source Health</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Guide progress and saved-source quality from your learn pipeline.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-2xl font-bold">{analytics.learn.totalGuides}</div>
                <div className="text-xs text-muted-foreground">guides</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{analytics.learn.savedSources}</div>
                <div className="text-xs text-muted-foreground">saved sources</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">{analytics.learn.completedGuides}</div>
                <div className="text-xs text-muted-foreground">completed guides</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-500">{analytics.learn.inProgressGuides}</div>
                <div className="text-xs text-muted-foreground">in progress</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border space-y-1.5 text-xs text-muted-foreground">
              <div>{analytics.sourceHealth.needsReview} sources flagged for review</div>
              <div>{analytics.sourceHealth.domFallback} DOM fallback captures</div>
              <div>{analytics.sourceHealth.staleGuideAttachments} stale guide attachments across {analytics.sourceHealth.guidesWithStaleSources} guides</div>
              <div>{analytics.sourceHealth.manualEdits} manual source edits recorded</div>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-1">Capture Health</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Import quality across manual, extension, and email capture paths.
            </p>
            <div className="space-y-2">
              {analytics.capture.jobsBySource.map((entry) => (
                <div key={entry.source} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{entry.source}</span>
                  <span className="font-medium">{entry.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border space-y-1.5 text-xs text-muted-foreground">
              <div>{analytics.capture.placeholderJobs} jobs still have placeholder metadata or failed capture text</div>
              <div>{analytics.insights.coveredStudyTopics} study topics already covered by guides</div>
              <div>{analytics.insights.uncoveredStudyTopics} study topics still need guides</div>
            </div>
          </div>
        </section>
      )}

      {/* AI Usage (collapsible) */}
      {hasAnalytics && analytics.tokenUsage.totals.calls > 0 && (
        <section className="bg-card border rounded-lg">
          <button
            onClick={() => setAiUsageOpen(!aiUsageOpen)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">AI Usage &amp; Costs</span>
              <span className="text-xs text-muted-foreground">
                Total: ${analytics.tokenUsage.totals.cost.toFixed(2)} · {analytics.tokenUsage.totals.calls} calls
              </span>
            </div>
            {aiUsageOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
          {aiUsageOpen && (
            <div className="px-4 pb-4 space-y-4">
              {analytics.tokenUsage.daily.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Daily Cost (Last 30 Days)</h4>
                  <MiniBarChart data={analytics.tokenUsage.daily} />
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Cost by Skill</h4>
                  <div className="space-y-1">
                    {analytics.tokenUsage.bySkill.slice(0, 8).map((s) => {
                      const maxCost = analytics.tokenUsage.bySkill[0]?.cost || 1;
                      return (
                        <div key={s.skill} className="flex items-center gap-2">
                          <span className="text-xs w-28 truncate font-mono">{s.skill}</span>
                          <div className="flex-1 bg-muted rounded h-2 overflow-hidden">
                            <div className="bg-primary h-full rounded" style={{ width: `${(s.cost / maxCost) * 100}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-14 text-right">${s.cost.toFixed(3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Cost by Model</h4>
                  <div className="space-y-1">
                    {analytics.tokenUsage.byModel.map((m) => (
                      <div key={m.model} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{m.model}</span>
                        <span className="text-muted-foreground">${m.cost.toFixed(3)} · {m.calls} calls</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {analytics.tokenUsage.bySkill.some((s) => s.cacheReads > 0 || s.cacheCreations > 0) && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Prompt Cache Efficiency</h4>
                  <div className="space-y-1">
                    {analytics.tokenUsage.bySkill
                      .filter((s) => s.cacheReads > 0 || s.cacheCreations > 0)
                      .map((s) => {
                        const totalCacheTokens = s.cacheReads + s.cacheCreations;
                        const hitPct = totalCacheTokens > 0 ? Math.round((s.cacheReads / totalCacheTokens) * 100) : 0;
                        return (
                          <div key={s.skill} className="flex items-center gap-2">
                            <span className="text-xs w-28 truncate font-mono">{s.skill}</span>
                            <div className="flex-1 bg-muted rounded h-2 overflow-hidden">
                              <div className="bg-green-500 h-full rounded" style={{ width: `${hitPct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-20 text-right">{hitPct}% hits</span>
                          </div>
                        );
                      })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Cache reads vs. creations — higher is better (less redundant input)</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Market Insights Card */}
      {hasAnalytics && analytics.insights.realisticJobs >= 2 ? (
        <a href="/insights" className="block">
          <section className="bg-card border border-primary/20 rounded-lg p-5 hover:bg-primary/[0.02] transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-semibold">Market Insights</h2>
              </div>
              <span className="text-xs text-primary">View all →</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xl font-bold">{analytics.insights.realisticJobs}</div>
                <div className="text-[10px] text-muted-foreground">realistic targets</div>
              </div>
              <div>
                <div className="text-xl font-bold">{analytics.insights.clusterCount}</div>
                <div className="text-[10px] text-muted-foreground">role profiles</div>
              </div>
              <div>
                <div className="text-xl font-bold text-red-400">{analytics.insights.gapCount}</div>
                <div className="text-[10px] text-muted-foreground">key gaps</div>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-400">{analytics.insights.avgScore}%</div>
                <div className="text-[10px] text-muted-foreground">avg match</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
              {analytics.insights.topFinding && (
                <div className="border-l-[3px] border-primary/40 bg-foreground/[0.02] rounded-r px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-primary">Top finding:</strong> {analytics.insights.topFinding}
                </div>
              )}
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {analytics.insights.coveredStudyTopics} covered · {analytics.insights.uncoveredStudyTopics} still open
              </div>
            </div>
          </section>
        </a>
      ) : hasAnalytics && analytics.versions.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-3">Profile Versions &amp; Resume History</h2>
          <div className="space-y-2">
            {analytics.versions.slice(0, 10).map((v) => (
              <div key={v.id} className="bg-card border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {v.job.company.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{v.job.title}</div>
                    <div className="text-xs text-muted-foreground">{v.job.company} · {new Date(v.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold">{v.score}</div>
                    {v.delta != null && v.delta > 0 && (
                      <div className="text-xs text-green-500">+{v.delta.toFixed(1)}</div>
                    )}
                  </div>
                  {v.resumes.length > 0 && (
                    <div className="flex gap-1">
                      {v.resumes.map((r) => (
                        <span key={r.id} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono uppercase">{r.format}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Two-column footer: Recent Jobs + Skills */}
      {(hasJobs || (profile?.skills && profile.skills.length > 0)) && (
        <section className="grid md:grid-cols-2 gap-6">
          {hasJobs && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Recent Jobs</h2>
              <div className="space-y-2">
                {jobs.slice(0, 5).map((job) => (
                  <a key={job.id} href="/jobs" className="block bg-card border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{job.title}</div>
                        <div className="text-xs text-muted-foreground">{job.company}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.applied && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                        {job.resumes.length > 0 && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{job.resumes.length} resume{job.resumes.length > 1 ? "s" : ""}</span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
          {profile?.skills && profile.skills.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Skills Overview</h2>
              <div className="space-y-3">
                {Object.entries(skillsByCategory).slice(0, 4).map(([category, skills]) => (
                  <div key={category}>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1">{category}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.slice(0, 8).map((s) => (
                        <span key={s.id} className="text-xs bg-muted px-2 py-0.5 rounded">{s.name}</span>
                      ))}
                      {skills.length > 8 && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">+{skills.length - 8}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
