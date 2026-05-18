"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/analytics/stat-card";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { SkillGapChart } from "@/components/analytics/skill-gap-chart";
import { ATSTrendChart } from "@/components/analytics/ats-trend-chart";
import { FreshnessChip } from "@/components/home/FreshnessChip";
import { SourceEffectivenessTable } from "@/components/home/SourceEffectivenessTable";
import {
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
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
  cachedAt?: { insights?: string | null };
  sectionsRevalidating?: string[];
  sourceEffectiveness?: import("@/lib/source-effectiveness").SourceRow[];
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-20 w-2/3" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-48" />
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
          className="flex-1 bg-primary/60 hover:bg-primary transition-colors cursor-pointer group relative"
          style={{ height: `${(d.cost / maxCost) * 100}%`, minHeight: d.cost > 0 ? "2px" : "0px" }}
          title={`${d.day}: $${d.cost.toFixed(4)}`}
        />
      ))}
    </div>
  );
}

// Roman numerals for section folios
const ROMAN = ["I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.", "IX.", "X."];

function SectionHead({
  index,
  title,
  kicker,
}: {
  index: number;
  title: string;
  kicker?: string;
}) {
  return (
    <div className="section-head">
      <span
        style={{
          fontFamily: "var(--font-dm-mono)",
          fontSize: "0.625rem",
          letterSpacing: "0.2em",
          color: "var(--marginalia)",
          fontWeight: 500,
        }}
      >
        §&nbsp;{ROMAN[index] ?? `${index + 1}.`}
      </span>
      <span className="section-title">{title}</span>
      {kicker && <span className="section-kicker">{kicker}</span>}
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
    let cancelled = false;

    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/jobs?pageSize=5").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, j]) => {
        if (cancelled) return;
        setProfile(p);
        setJobs(Array.isArray(j) ? j : (j?.jobs ?? []));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const res = await fetch("/api/analytics");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setAnalytics(data);
      } catch {
        // network blip — wait for next interval
      }
    }

    function startPolling() {
      if (intervalId !== null) return;
      intervalId = setInterval(refresh, 30_000);
    }

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refresh();
        startPolling();
      } else {
        stopPolling();
      }
    }

    void refresh();
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (loading) {
    return (
      <div className="py-4">
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

  let sectionIndex = 0;

  return (
    <div className="space-y-12">
      {/* ─── FRONT-PAGE FLAG ─── */}
      <section className="anim-fade-up">
        <div className="folio">
          <span>{firstName ? "From the Desk of" : "No. 1 — Inaugural Issue"}</span>
          {firstName && <span className="folio-sep" />}
          {firstName && <span>{firstName}</span>}
          <span className="folio-sep" />
          <span>Job Search Command Center</span>
          <span className="folio-sep" />
          <span style={{ marginLeft: "auto" }}>Ed. Claude · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>

        <h1
          className="mt-6 text-[3.25rem] sm:text-[4rem] leading-[0.94] tracking-tight text-foreground"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontWeight: 400,
            letterSpacing: "-0.025em",
          }}
        >
          {firstName ? (
            <>
              Good afternoon,
              <br />
              <span className="text-gradient">{firstName}.</span>
            </>
          ) : (
            <>
              A Quiet Press
              <br />
              <span className="text-gradient">for Loud Work.</span>
            </>
          )}
        </h1>

        <p
          className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-foreground/80 drop-cap"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          {hasProfile
            ? "The week's intelligence is below: active targets, strongest matches, where your résumé stands against the market, and what to study next to close the gap. Edited automatically, quietly, on the page."
            : "This is a personal broadsheet for the work of getting hired. Upload a résumé, paste in the jobs you care about, and the press handles the rest — parsing, matching, tailoring, and what to learn next."}
        </p>

        {!hasProfile && (
          <div className="mt-7 flex gap-3">
            <a
              href="/profile"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <User className="w-4 h-4" /> Begin the First Edition
            </a>
          </div>
        )}
        {hasProfile && !hasJobs && (
          <div className="mt-7">
            <a
              href="/jobs"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <Briefcase className="w-4 h-4" /> File Your First Job
            </a>
          </div>
        )}
      </section>

      {/* ─── How it Works — new readers only ─── */}
      {!hasProfile && (
        <section className="anim-fade-up-1">
          <SectionHead index={sectionIndex++} title="The Process" kicker="In three movements" />
          <div className="grid md:grid-cols-3 gap-6 border-t border-foreground/80 border-t-[3px] pt-6">
            {[
              { step: "I", title: "Upload Résumé", desc: "A PDF or DOCX. The press parses it into a structured dossier and catalogs every skill it can find." },
              { step: "II", title: "File the Jobs", desc: "Paste URLs or descriptions. Requirements are extracted, compatibility is scored, and gaps surface automatically." },
              { step: "III", title: "Run the Print", desc: "Tailored résumés optimized for each role's keywords, published to a private archive on demand." },
            ].map((item) => (
              <article key={item.step} className="space-y-2 border-l border-foreground/15 pl-5">
                <div
                  className="numerals text-3xl text-primary"
                  style={{ lineHeight: 1 }}
                >
                  {item.step}
                </div>
                <div
                  className="text-[1.125rem] text-foreground"
                  style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 400 }}
                >
                  {item.title}
                </div>
                <div className="text-sm text-foreground/70 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans)" }}>
                  {item.desc}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ─── Hero Stats ─── */}
      {hasAnalytics && (
        <section className="anim-fade-up-2">
          <SectionHead index={sectionIndex++} title="The Ledger" kicker="This week's figures" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="Active Jobs"
              value={analytics.funnel.totalJobs - analytics.funnel.appliedJobs}
              trend={`+${analytics.funnel.weeklyAdded} this week`}
              trendColor="text-foreground/60"
            />
            <StatCard
              label="Applied"
              value={analytics.funnel.appliedJobs}
              trend={analytics.funnel.totalJobs > 0 ? `${Math.round((analytics.funnel.appliedJobs / analytics.funnel.totalJobs) * 100)}% of total` : ""}
            />
            <StatCard
              label="Avg Match"
              value={analytics.matchTrends.averageScore || "—"}
              trend={analytics.matchTrends.jobCount > 0 ? `${analytics.matchTrends.strongFitCount} strong-fit` : ""}
            />
            <StatCard
              label="Résumé Qual."
              value={analytics.resumeQualityTrends.averageQuality || "—"}
              trend={
                analytics.resumeQualityTrends.jobCount > 0
                  ? `${analytics.resumeQualityTrends.averageDelta >= 0 ? "+" : ""}${analytics.resumeQualityTrends.averageDelta} avg Δ`
                  : ""
              }
              trendColor="text-primary"
            />
            <StatCard
              label="Issues Printed"
              value={analytics.resumeCount}
            />
          </div>
        </section>
      )}

      {/* ─── Funnel ─── */}
      {hasAnalytics && analytics.funnel.totalJobs > 0 && (
        <section className="anim-fade-up-3">
          <SectionHead index={sectionIndex++} title="The Pipeline" kicker="From lead to letter" />
          <FunnelChart data={analytics.funnel} />
        </section>
      )}

      {/* ─── Source Effectiveness ─── */}
      {hasAnalytics && (
        <section>
          <SectionHead index={sectionIndex++} title="Source Effectiveness" kicker="Where your leads convert" />
          <SourceEffectivenessTable rows={analytics?.sourceEffectiveness ?? []} />
        </section>
      )}

      {/* ─── Two-column: Skill gaps + ATS trend ─── */}
      {hasAnalytics && (analytics.skillGaps.length > 0 || analytics.resumeQualityTrends.jobCount > 0) && (
        <section>
          <SectionHead index={sectionIndex++} title="The Audit" kicker="Strengths & shortfalls" />
          <div className="grid md:grid-cols-2 gap-4">
            {analytics.skillGaps.length > 0 && <SkillGapChart data={analytics.skillGaps} />}
            {analytics.resumeQualityTrends.jobCount > 0 && <ATSTrendChart data={analytics.resumeQualityTrends} />}
          </div>
        </section>
      )}

      {/* ─── Learn & Capture Health ─── */}
      {hasAnalytics && (
        <section>
          <SectionHead index={sectionIndex++} title="The Archive" kicker="Study & source hygiene" />
          <div className="grid md:grid-cols-2 gap-4">
            <div className="index-card">
              <div className="label-mono-sm text-muted-foreground">Learn &amp; Source Health</div>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Guide progress and saved-source quality from your learn pipeline.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="numerals text-3xl text-foreground leading-none">{analytics.learn.totalGuides}</div>
                  <div className="label-mono-sm text-muted-foreground mt-1">Guides</div>
                </div>
                <div>
                  <div className="numerals text-3xl text-foreground leading-none">{analytics.learn.savedSources}</div>
                  <div className="label-mono-sm text-muted-foreground mt-1">Saved Sources</div>
                </div>
                <div>
                  <div className="numerals text-3xl text-primary leading-none">{analytics.learn.completedGuides}</div>
                  <div className="label-mono-sm text-muted-foreground mt-1">Completed</div>
                </div>
                <div>
                  <div className="numerals text-3xl text-foreground/70 leading-none">{analytics.learn.inProgressGuides}</div>
                  <div className="label-mono-sm text-muted-foreground mt-1">In Progress</div>
                </div>
              </div>
              <div className="rule-hair mt-4 mb-3" />
              <ul className="space-y-1.5 text-xs text-foreground/65" style={{ fontFamily: "var(--font-geist-sans)" }}>
                <li>— {analytics.sourceHealth.needsReview} sources flagged for review</li>
                <li>— {analytics.sourceHealth.domFallback} DOM fallback captures</li>
                <li>— {analytics.sourceHealth.staleGuideAttachments} stale attachments across {analytics.sourceHealth.guidesWithStaleSources} guides</li>
                <li>— {analytics.sourceHealth.manualEdits} manual source edits recorded</li>
              </ul>
            </div>

            <div className="index-card">
              <div className="label-mono-sm text-muted-foreground">Capture Health</div>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Import quality across manual, extension, and email capture paths.
              </p>
              <div className="space-y-1.5">
                {analytics.capture.jobsBySource.map((entry) => (
                  <div key={entry.source} className="flex items-center justify-between text-sm border-b border-foreground/10 pb-1">
                    <span className="label-mono-sm text-foreground/70">{entry.source}</span>
                    <span className="numerals text-lg text-foreground leading-none">{entry.count}</span>
                  </div>
                ))}
              </div>
              <div className="rule-hair mt-4 mb-3" />
              <ul className="space-y-1.5 text-xs text-foreground/65" style={{ fontFamily: "var(--font-geist-sans)" }}>
                <li>— {analytics.capture.placeholderJobs} jobs with placeholder metadata</li>
                <li>— {analytics.insights.coveredStudyTopics} topics already covered</li>
                <li>— {analytics.insights.uncoveredStudyTopics} still to cover</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ─── AI Usage (collapsible) ─── */}
      {hasAnalytics && analytics.tokenUsage.totals.calls > 0 && (
        <section>
          <div className="border border-foreground/15 bg-card">
            <button
              onClick={() => setAiUsageOpen(!aiUsageOpen)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <span
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontStyle: "italic",
                    fontSize: "1.15rem",
                    color: "var(--ink)",
                  }}
                >
                  The Meter
                </span>
                <span className="label-mono-sm text-muted-foreground">
                  ${analytics.tokenUsage.totals.cost.toFixed(2)} · {analytics.tokenUsage.totals.calls} calls
                </span>
              </div>
              {aiUsageOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
            {aiUsageOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-foreground/10">
                {analytics.tokenUsage.daily.length > 0 && (
                  <div className="pt-3">
                    <h4 className="label-mono-sm text-muted-foreground mb-2">Daily Cost · Last 30 Days</h4>
                    <MiniBarChart data={analytics.tokenUsage.daily} />
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="label-mono-sm text-muted-foreground mb-2">Cost by Skill</h4>
                    <div className="space-y-1">
                      {analytics.tokenUsage.bySkill.slice(0, 8).map((s) => {
                        const maxCost = analytics.tokenUsage.bySkill[0]?.cost || 1;
                        return (
                          <div key={s.skill} className="flex items-center gap-2">
                            <span className="text-xs w-28 truncate font-mono">{s.skill}</span>
                            <div className="flex-1 bg-muted h-2 overflow-hidden">
                              <div className="bg-primary h-full" style={{ width: `${(s.cost / maxCost) * 100}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-14 text-right font-mono">${s.cost.toFixed(3)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h4 className="label-mono-sm text-muted-foreground mb-2">Cost by Model</h4>
                    <div className="space-y-1">
                      {analytics.tokenUsage.byModel.map((m) => (
                        <div key={m.model} className="flex items-center justify-between text-xs border-b border-foreground/10 py-1">
                          <span className="font-mono">{m.model}</span>
                          <span className="text-muted-foreground font-mono">${m.cost.toFixed(3)} · {m.calls} calls</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {analytics.tokenUsage.bySkill.some((s) => s.cacheReads > 0 || s.cacheCreations > 0) && (
                  <div>
                    <h4 className="label-mono-sm text-muted-foreground mb-2">Prompt Cache Efficiency</h4>
                    <div className="space-y-1">
                      {analytics.tokenUsage.bySkill
                        .filter((s) => s.cacheReads > 0 || s.cacheCreations > 0)
                        .map((s) => {
                          const totalCacheTokens = s.cacheReads + s.cacheCreations;
                          const hitPct = totalCacheTokens > 0 ? Math.round((s.cacheReads / totalCacheTokens) * 100) : 0;
                          return (
                            <div key={s.skill} className="flex items-center gap-2">
                              <span className="text-xs w-28 truncate font-mono">{s.skill}</span>
                              <div className="flex-1 bg-muted h-2 overflow-hidden">
                                <div className="bg-primary/80 h-full" style={{ width: `${hitPct}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-20 text-right font-mono">{hitPct}% hits</span>
                            </div>
                          );
                        })}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Cache reads vs. creations — higher is better.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── Market Insights ─── */}
      {hasAnalytics && analytics.insights.realisticJobs >= 2 ? (
        <a href="/insights" className="block">
          <section className="relative border-y-[3px] border-foreground/85 py-6 card-hover">
            <div className="absolute -top-[3px] left-0 right-0 h-[3px] bg-foreground/85" />
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-baseline gap-3">
                <span className="label-mono-sm text-primary">§ Feature Report</span>
                <h2
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontStyle: "italic",
                    fontSize: "1.85rem",
                    lineHeight: 1,
                    color: "var(--ink)",
                  }}
                >
                  The Market Reads You
                </h2>
                <FreshnessChip
                  cachedAt={analytics?.cachedAt?.insights ?? null}
                  revalidating={analytics?.sectionsRevalidating?.includes("insights") ?? false}
                />
              </div>
              <span className="label-mono-sm text-primary">Full Story →</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div>
                <div className="numerals text-3xl text-foreground leading-none">{analytics.insights.realisticJobs}</div>
                <div className="label-mono-sm text-muted-foreground mt-1">Realistic Targets</div>
              </div>
              <div>
                <div className="numerals text-3xl text-foreground leading-none">{analytics.insights.clusterCount}</div>
                <div className="label-mono-sm text-muted-foreground mt-1">Role Profiles</div>
              </div>
              <div>
                <div className="numerals text-3xl text-primary leading-none">{analytics.insights.gapCount}</div>
                <div className="label-mono-sm text-muted-foreground mt-1">Key Gaps</div>
              </div>
              <div>
                <div className="numerals text-3xl text-foreground leading-none">{analytics.insights.avgScore}%</div>
                <div className="label-mono-sm text-muted-foreground mt-1">Avg Match</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
              {analytics.insights.topFinding && (
                <blockquote
                  className="border-l-[3px] border-primary pl-4 py-1 text-[0.95rem] leading-relaxed text-foreground/85"
                  style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 400 }}
                >
                  <span className="label-mono text-primary not-italic mr-2">Headline</span>
                  {analytics.insights.topFinding}
                </blockquote>
              )}
              <div className="label-mono-sm text-muted-foreground whitespace-nowrap self-end">
                {analytics.insights.coveredStudyTopics} covered · {analytics.insights.uncoveredStudyTopics} open
              </div>
            </div>
          </section>
        </a>
      ) : hasAnalytics && analytics.versions.length > 0 ? (
        <section>
          <SectionHead index={sectionIndex++} title="The Archive" kicker="Recent issues printed" />
          <div className="space-y-0 border-t border-foreground/15">
            {analytics.versions.slice(0, 10).map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b border-foreground/15 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 bg-primary/8 border border-primary/30 flex items-center justify-center"
                    style={{
                      fontFamily: "var(--font-cormorant)",
                      fontStyle: "italic",
                      fontSize: "1.1rem",
                      color: "var(--primary)",
                    }}
                  >
                    {v.job.company.charAt(0)}
                  </div>
                  <div>
                    <div
                      className="text-[1rem] text-foreground"
                      style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 400 }}
                    >
                      {v.job.title}
                    </div>
                    <div className="label-mono-sm text-muted-foreground mt-0.5">
                      {v.job.company} · {new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="numerals text-xl text-foreground leading-none">{v.score}</div>
                    {v.delta != null && v.delta > 0 && (
                      <div className="label-mono-sm text-primary mt-0.5">+{v.delta.toFixed(1)}</div>
                    )}
                  </div>
                  {v.resumes.length > 0 && (
                    <div className="flex gap-1">
                      {v.resumes.map((r) => (
                        <span key={r.id} className="label-mono-sm text-foreground/70 border border-foreground/25 px-1.5 py-0.5">
                          {r.format}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ─── Recent Jobs + Skills ─── */}
      {(hasJobs || (profile?.skills && profile.skills.length > 0)) && (
        <section className="grid md:grid-cols-[1.15fr_1fr] gap-8">
          {hasJobs && (
            <div>
              <SectionHead index={sectionIndex++} title="Recent Dispatches" kicker="Latest jobs filed" />
              <div className="space-y-0 border-t border-foreground/15">
                {jobs.slice(0, 5).map((job) => (
                  <a
                    key={job.id}
                    href="/jobs"
                    className="group flex items-center justify-between border-b border-foreground/15 py-3 hover:bg-foreground/[0.025] -mx-2 px-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div
                        className="text-[1.05rem] text-foreground truncate"
                        style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 400 }}
                      >
                        {job.title}
                      </div>
                      <div className="label-mono-sm text-muted-foreground mt-0.5 truncate">{job.company}</div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {job.applied && (
                        <span className="stamp stamp-accent">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Applied
                        </span>
                      )}
                      {job.resumes.length > 0 && (
                        <span className="label-mono-sm text-foreground/60 border border-foreground/20 px-1.5 py-0.5">
                          {job.resumes.length} ed.
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
          {profile?.skills && profile.skills.length > 0 && (
            <div>
              <SectionHead index={sectionIndex++} title="Typecase" kicker="Your standing set" />
              <div className="space-y-4 border-t border-foreground/15 pt-4">
                {Object.entries(skillsByCategory).slice(0, 4).map(([category, skills]) => (
                  <div key={category}>
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="label-mono-sm text-primary">{category}</div>
                      <div className="rule-hair flex-1 mx-3" />
                      <div className="label-mono-sm text-muted-foreground">{skills.length}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.slice(0, 8).map((s) => (
                        <span
                          key={s.id}
                          className="text-xs border border-foreground/25 px-2 py-0.5 text-foreground/85"
                          style={{ fontFamily: "var(--font-geist-sans)" }}
                        >
                          {s.name}
                        </span>
                      ))}
                      {skills.length > 8 && (
                        <span className="text-xs border border-dashed border-foreground/25 px-2 py-0.5 text-muted-foreground">
                          +{skills.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ─── END MARK ─── */}
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="label-mono text-muted-foreground">— Fin —</div>
        <div className="flex items-center gap-1 text-foreground/30">
          <span className="inline-block w-1.5 h-1.5 bg-current rounded-full" />
          <span className="inline-block w-1.5 h-1.5 bg-current rounded-full" />
          <span className="inline-block w-1.5 h-1.5 bg-current rounded-full" />
        </div>
      </div>
    </div>
  );
}
