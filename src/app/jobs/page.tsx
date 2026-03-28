"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ArrowRight,
  Loader2,
  Lightbulb,
  MessageSquare,
  History,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Eye,
  EyeOff,
  Zap,
  Trash2,
  X,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { JobChatPanel } from "@/components/job-chat-panel";
import { useScrollReveal } from "@/lib/hooks/use-scroll-reveal";

const AI_MODELS = [
  { value: "sonnet", label: "Sonnet", description: "Balanced" },
  { value: "haiku", label: "Haiku", description: "Fast & cheap" },
  { value: "opus", label: "Opus", description: "Most capable" },
];

interface Job {
  id: string;
  title: string;
  company: string;
  url?: string;
  description: string;
  skills?: string;
  sponsorship?: string;
  terminologyMap?: string;
  matchResult?: string;
  aiModel?: string;
  createdAt: string;
  resumes: Array<{ id: string; format: string; createdAt: string }>;
  profileVersions?: Array<{ id: string; score: number; delta: number | null; createdAt: string; resumes: Array<{ id: string; format: string; createdAt: string }> }>;
}

interface MatchResult {
  overallScore: number;
  dimensionalScores?: {
    directMatch: number;
    transferable: number;
    experienceDepth: number;
    careerNarrative: number;
  };
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

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 38;
  const offset = circumference - (score / 100) * circumference;
  const gradientId = `score-grad-${score}`;
  const glowColor =
    score >= 80 ? "oklch(0.55 0.15 150 / 0.4)"
    : score >= 60 ? "oklch(0.55 0.13 260 / 0.4)"
    : score >= 40 ? "oklch(0.60 0.15 70 / 0.4)"
    : "oklch(0.55 0.20 25 / 0.4)";
  const [gradStart, gradEnd] =
    score >= 80 ? ["#34d399", "#059669"]
    : score >= 60 ? ["#60a5fa", "#2563eb"]
    : score >= 40 ? ["#fbbf24", "#d97706"]
    : ["#f87171", "#dc2626"];
  const bgColor =
    score >= 80 ? "text-emerald-700 dark:text-emerald-300"
    : score >= 60 ? "text-blue-700 dark:text-blue-300"
    : score >= 40 ? "text-amber-700 dark:text-amber-300"
    : "text-red-700 dark:text-red-300";

  return (
    <div className="relative w-20 h-20 shrink-0 score-ring-glow" style={{ "--ring-glow-color": glowColor } as React.CSSProperties}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradStart} />
            <stop offset="100%" stopColor={gradEnd} />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r="38" fill="none" strokeWidth="3" className="stroke-border/40" />
        <circle
          cx="40" cy="40" r="38" fill="none" strokeWidth="3.5"
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          className="transition-all duration-700 ease-out"
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-xl font-medium leading-none ${bgColor}`}
          style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic" }}
        >
          {score}
        </span>
        <span className="text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5"
          style={{ fontFamily: "var(--font-dm-mono)" }}>
          ATS
        </span>
      </div>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    high: "bg-primary/10 text-primary border-primary/20",
    medium: "bg-blue-100 text-blue-700 border-blue-200/50 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700/30",
    low: "bg-muted text-muted-foreground border-border/50",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider border ${colors[impact] || colors.low}`}
      style={{ fontFamily: "var(--font-dm-mono)" }}
    >
      {impact}
    </span>
  );
}

function AnalysisCTA({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <div className="mt-6 relative">
      <div className="section-divider mb-6" />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p
            className="text-muted-foreground mb-1"
            style={{
              fontFamily: "var(--font-dm-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Profile Match
          </p>
          <p
            className="text-foreground leading-tight"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "1.35rem",
              fontWeight: 400,
            }}
          >
            How well does your profile <span className="text-primary">align</span>?
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-md leading-relaxed">
            Run an AI analysis to score your profile against this role — identifies matching skills, bridgeable gaps, and actionable resume tips.
          </p>
        </div>
        <Button
          onClick={onAnalyze}
          className="gap-2 rounded-sm px-5 h-10 shadow-sm"
        >
          <Zap className="w-3.5 h-3.5" />
          Analyze Match
        </Button>
      </div>
    </div>
  );
}

function MatchPanel({
  match,
  loading,
  onReanalyze,
  hasProfile,
  onApplyTips,
  terminologyMap,
}: {
  match: MatchResult | null;
  loading: boolean;
  onReanalyze?: () => void;
  hasProfile: boolean;
  onApplyTips?: () => void;
  terminologyMap?: Array<{jdTerm: string; resumeSynonyms: string[]}>;
}) {
  if (loading) {
    return (
      <div className="mt-6 anim-fade-up">
        <div className="section-divider mb-5" />
        <div className="flex items-start gap-5">
          {/* Animated score ring placeholder */}
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="38" fill="none" strokeWidth="3" className="stroke-border/30" />
              <circle
                cx="40" cy="40" r="38" fill="none" strokeWidth="3"
                strokeLinecap="round"
                className="stroke-primary/40 anim-pulse-ring"
                style={{ strokeDasharray: "60 180" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 anim-dot-1" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 anim-dot-2" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 anim-dot-3" />
              </span>
            </div>
          </div>
          <div className="flex-1 pt-1">
            <p
              className="text-primary mb-1"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.6rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Analyzing Match
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Scoring your profile against this role&rsquo;s requirements...
            </p>
            {/* Indeterminate progress bar */}
            <div className="h-0.5 bg-border/30 rounded-full overflow-hidden w-full max-w-xs">
              <div className="h-full w-2/5 bg-primary/50 rounded-full anim-progress-bar" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!match) return null;

  const { breakdown, resumeTips, skillsToHighlight, verdictSummary } = match;
  const totalSkills = breakdown.directMatches.length + breakdown.bridgeableSkills.length + breakdown.gaps.length;

  return (
    <div className="mt-6">
      <div className="section-divider mb-5" />

      {/* Score + Verdict row */}
      <div className="flex items-start gap-5 mb-6">
        <ScoreRing score={match.overallScore} />
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-3 mb-1.5">
            <p
              className="text-muted-foreground"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.6rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Profile Match
            </p>
            {onReanalyze && hasProfile && (
              <button
                onClick={onReanalyze}
                className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                style={{
                  fontFamily: "var(--font-dm-mono)",
                  fontSize: "0.55rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                <Zap className="w-2.5 h-2.5" /> Re-analyze
              </button>
            )}
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {verdictSummary}
          </p>
        </div>
      </div>

      {/* Dimensional Scores */}
      {match.dimensionalScores && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 mb-6">
          {([
            { key: "directMatch" as const, label: "Direct Match", weight: "40%" },
            { key: "transferable" as const, label: "Transferable", weight: "30%" },
            { key: "experienceDepth" as const, label: "Experience Depth", weight: "20%" },
            { key: "careerNarrative" as const, label: "Career Narrative", weight: "10%" },
          ] as const).map(({ key, label, weight }) => {
            const score = match.dimensionalScores![key];
            const barColor =
              score >= 80 ? "bg-emerald-500 dark:bg-emerald-400"
              : score >= 60 ? "bg-blue-500 dark:bg-blue-400"
              : score >= 40 ? "bg-amber-500 dark:bg-amber-400"
              : "bg-red-500 dark:bg-red-400";
            const textColor =
              score >= 80 ? "text-emerald-700 dark:text-emerald-300"
              : score >= 60 ? "text-blue-700 dark:text-blue-300"
              : score >= 40 ? "text-amber-700 dark:text-amber-300"
              : "text-red-700 dark:text-red-300";
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className="text-muted-foreground"
                      style={{
                        fontFamily: "var(--font-dm-mono)",
                        fontSize: "0.5rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </span>
                    <span className="text-muted-foreground/40" style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.45rem" }}>
                      {weight}
                    </span>
                  </span>
                  <span
                    className={textColor}
                    style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "0.95rem" }}
                  >
                    {score}
                  </span>
                </div>
                <div className="h-1 bg-border/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Breakdown grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/60 rounded-sm overflow-hidden border border-border/60">
        {/* Direct Matches */}
        <div className="bg-card p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-emerald-600 dark:text-emerald-400"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.55rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Direct Matches
            </p>
            <span
              className="text-emerald-600 dark:text-emerald-400"
              style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "1.1rem" }}
            >
              {breakdown.directMatches.length}
              {totalSkills > 0 && (
                <span className="text-muted-foreground text-xs font-sans">/{totalSkills}</span>
              )}
            </span>
          </div>
          {/* Progress slice */}
          <div className="h-0.5 bg-border/40 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: totalSkills > 0 ? `${(breakdown.directMatches.length / totalSkills) * 100}%` : "0%" }}
            />
          </div>
          <div className="flex flex-wrap gap-1 overflow-hidden">
            {breakdown.directMatches.map((s) => (
              <span
                key={s}
                className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/50 dark:border-emerald-800/40 px-1.5 py-0.5 rounded-sm truncate max-w-full"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Bridgeable */}
        <div className="bg-card p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-blue-600 dark:text-blue-400"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.55rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Bridgeable
            </p>
            <span
              className="text-blue-600 dark:text-blue-400"
              style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "1.1rem" }}
            >
              {breakdown.bridgeableSkills.length}
            </span>
          </div>
          <div className="h-0.5 bg-border/40 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-500"
              style={{ width: totalSkills > 0 ? `${(breakdown.bridgeableSkills.length / totalSkills) * 100}%` : "0%" }}
            />
          </div>
          {breakdown.bridgeableSkills.length > 0 ? (
            <div className="space-y-2 overflow-hidden">
              {breakdown.bridgeableSkills.map((b) => (
                <div key={b.jobRequirement} className="text-[11px] leading-snug" title={b.explanation}>
                  <span className="text-foreground font-medium">{b.yourSkill}</span>
                  <span className="text-muted-foreground mx-1">&rarr;</span>
                  <span className="text-blue-600 dark:text-blue-400">{b.jobRequirement}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">None identified</p>
          )}
        </div>

        {/* Gaps */}
        <div className="bg-card p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-muted-foreground"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.55rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Gaps
            </p>
            <span
              className="text-muted-foreground"
              style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "1.1rem" }}
            >
              {breakdown.gaps.length}
            </span>
          </div>
          <div className="h-0.5 bg-border/40 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-red-400 dark:bg-red-500 rounded-full transition-all duration-500"
              style={{ width: totalSkills > 0 ? `${(breakdown.gaps.length / totalSkills) * 100}%` : "0%" }}
            />
          </div>
          {breakdown.gaps.length > 0 ? (
            <ul className="space-y-1.5 overflow-hidden">
              {breakdown.gaps.map((g) => (
                <li key={g} className="text-[11px] text-muted-foreground leading-snug truncate" title={g}>
                  <span className="text-red-400 dark:text-red-500 mr-1">&mdash;</span>{g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">No major gaps</p>
          )}
        </div>
      </div>

      {/* Skills to Highlight */}
      {skillsToHighlight.length > 0 && (
        <div className="mt-5">
          <p
            className="text-muted-foreground mb-2"
            style={{
              fontFamily: "var(--font-dm-mono)",
              fontSize: "0.55rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Emphasize in Resume
          </p>
          <div className="flex flex-wrap gap-1.5">
            {skillsToHighlight.map((s) => (
              <span
                key={s}
                className="text-[11px] text-primary bg-primary/6 border border-primary/15 px-2 py-0.5 rounded-sm"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Terminology Guide */}
      {terminologyMap && terminologyMap.length > 0 && (
        <div className="mt-5">
          <p
            className="text-muted-foreground mb-2 flex items-center gap-1.5"
            style={{
              fontFamily: "var(--font-dm-mono)",
              fontSize: "0.55rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <ArrowRight className="w-3 h-3" />
            Terminology Guide
          </p>
          <p className="text-[10px] text-muted-foreground/70 mb-2.5 leading-relaxed">
            Use the JD&rsquo;s exact terms in your resume for better ATS matching.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {terminologyMap.map((t) => (
              <div key={t.jdTerm} className="flex items-baseline gap-2 text-[11px] leading-snug">
                <span className="text-primary font-medium shrink-0">{t.jdTerm}</span>
                <span className="text-muted-foreground/50">&larr;</span>
                <span className="text-muted-foreground truncate">{t.resumeSynonyms.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume Tips */}
      {resumeTips.length > 0 && (
        <div className="mt-5">
          <p
            className="text-muted-foreground mb-3 flex items-center gap-1.5"
            style={{
              fontFamily: "var(--font-dm-mono)",
              fontSize: "0.55rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <Lightbulb className="w-3 h-3" />
            Resume Tips
          </p>
          <div className="space-y-1.5">
            {resumeTips.map((tip) => (
              <div
                key={tip.priority}
                className={`flex items-start gap-3 py-2.5 px-3 rounded-sm border ${
                  tip.grounded
                    ? "border-border/40 bg-card"
                    : "border-amber-200/40 bg-amber-50/10 dark:border-amber-800/20 dark:bg-amber-950/10"
                }`}
              >
                <ImpactBadge impact={tip.impact} />
                <span className="flex-1 text-[11px] text-foreground/70 leading-relaxed">
                  {tip.action}
                  {!tip.grounded && (
                    <span
                      className="text-amber-600 dark:text-amber-400 ml-1.5"
                      style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase" }}
                    >
                      stretch
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply Tips CTA */}
      {hasProfile && onApplyTips && resumeTips.length > 0 && (
        <div className="mt-6">
          <div className="section-divider mb-5" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{
                  fontFamily: "var(--font-dm-mono)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Optimize Profile
              </p>
              <p className="text-xs text-foreground/70 leading-relaxed max-w-sm">
                Apply {resumeTips.filter((t) => t.grounded).length} grounded tips to your profile automatically.
                You can review and accept or reject each change.
              </p>
            </div>
            <Button
              onClick={onApplyTips}
              variant="default"
              size="sm"
              className="gap-2 rounded-sm px-4 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Apply Resume Tips
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type SortField = "title" | "company" | "atsScore" | "resumes" | "createdAt";
type SortDir = "asc" | "desc";

function ExpandedJobDetail({
  job,
  match,
  isMatchLoading,
  hasProfile,
  hasVersions,
  generatingFor,
  profileEmails,
  selectedEmail,
  onSetExpandedJob,
  onFetchMatch,
  onOpenChatAndApplyTips,
  onHandleGenerateResume,
  onSetSelectedEmail,
  onSetPreviewResume,
}: {
  job: Job;
  match: MatchResult | undefined;
  isMatchLoading: boolean;
  hasProfile: boolean;
  hasVersions: boolean;
  generatingFor: string | null;
  profileEmails: string[];
  selectedEmail: string;
  onSetExpandedJob: (id: string | null) => void;
  onFetchMatch: (jobId: string, force?: boolean) => void;
  onOpenChatAndApplyTips: (job: Job) => void;
  onHandleGenerateResume: (job: Job, format: "pdf" | "docx") => void;
  onSetSelectedEmail: (email: string) => void;
  onSetPreviewResume: (resumeId: string, job: Job) => void;
}) {
  const generatingFormat = generatingFor?.startsWith(job.id + ":") ? generatingFor.split(":")[1] : null;
  const seenIds = new Set<string>();
  const allResumes: Array<{ id: string; format: string; createdAt: string }> = [];
  for (const r of [...(job.profileVersions?.flatMap((v) => v.resumes) ?? []), ...job.resumes]) {
    if (!seenIds.has(r.id)) { seenIds.add(r.id); allResumes.push(r); }
  }
  // Sort newest first
  allResumes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestPdf = allResumes.find((r) => r.format === "pdf");

  function jobHasResumeFormat(fmt: string): boolean {
    if (job.resumes.some((r) => r.format === fmt)) return true;
    if (job.profileVersions?.some((v) => v.resumes.some((r) => r.format === fmt))) return true;
    return false;
  }

  return (
    <div className="border-t border-border bg-card overflow-hidden">
      {/* Panel header */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-muted-foreground mb-1"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.6rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Job Details
            </p>
            <h3
              className="text-foreground leading-tight"
              style={{
                fontFamily: "var(--font-cormorant)",
                fontStyle: "italic",
                fontSize: "1.5rem",
                fontWeight: 400,
              }}
            >
              {job.title}
              <span className="text-muted-foreground text-lg"> at </span>
              <span className="text-primary">{job.company}</span>
            </h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {job.sponsorship === "unavailable" && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-red-700 bg-red-50 border border-red-200/50 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800/30"
                  style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
                >
                  <ShieldAlert className="w-2.5 h-2.5" /> No Sponsorship
                </span>
              )}
              {job.sponsorship === "available" && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-emerald-700 bg-emerald-50 border border-emerald-200/50 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800/30"
                  style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
                >
                  <ShieldCheck className="w-2.5 h-2.5" /> Sponsors
                </span>
              )}
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.55rem", letterSpacing: "0.08em" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-2.5 h-2.5" /> View Posting
                </a>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -mt-1 -mr-2" onClick={() => onSetExpandedJob(null)}>
            <ChevronUp className="w-4 h-4" />
          </Button>
        </div>

        {/* Required skills strip */}
        {job.skills && (
          <div className="mt-4">
            <p
              className="text-muted-foreground mb-2"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.55rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Required Skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {JSON.parse(job.skills).slice(0, 14).map((skill: string) => (
                <span
                  key={skill}
                  className={`text-[11px] px-2 py-0.5 rounded-sm border ${
                    match?.skillsToHighlight?.includes(skill)
                      ? "text-emerald-700 bg-emerald-50/60 border-emerald-200/50 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800/30"
                      : "text-foreground/70 bg-muted/30 border-border/40"
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Analysis section */}
      <div className="px-6">
        {!match && !isMatchLoading && hasProfile && (
          <AnalysisCTA onAnalyze={() => onFetchMatch(job.id)} />
        )}
        <MatchPanel
          match={match || null}
          loading={isMatchLoading || false}
          onReanalyze={() => onFetchMatch(job.id, true)}
          hasProfile={hasProfile}
          onApplyTips={() => onOpenChatAndApplyTips(job)}
          terminologyMap={(() => { try { return job.terminologyMap ? JSON.parse(job.terminologyMap) : undefined; } catch { return undefined; } })()}
        />
      </div>

      {/* Version History */}
      {hasVersions && (
        <div className="px-6 mt-5">
          <div className="section-divider mb-4" />
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-muted-foreground flex items-center gap-1.5"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.6rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <History className="w-3 h-3" />
              Version History
            </p>
            <a
              href="/versions"
              className="text-primary hover:underline"
              style={{
                fontFamily: "var(--font-dm-mono)",
                fontSize: "0.55rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              View all
            </a>
          </div>
          {/* Score progression */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {job.profileVersions && job.profileVersions.length > 0 && (() => {
              // Derive original score from the oldest version (score - delta)
              const oldest = job.profileVersions[job.profileVersions.length - 1];
              const originalScore = oldest.delta != null ? Math.round(oldest.score - oldest.delta) : (match?.overallScore ?? oldest.score);
              return (
                <>
                  <span
                    className="text-muted-foreground"
                    style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
                  >
                    Original
                  </span>
                  <MatchScoreBadge score={originalScore} />
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                </>
              );
            })()}
            {job.profileVersions!.slice().reverse().map((v, vi) => (
              <span key={v.id} className="inline-flex items-center gap-1">
                {vi > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/40" />}
                <MatchScoreBadge score={v.score} />
                {v.delta != null && v.delta > 0 && (
                  <span
                    className="text-emerald-600 dark:text-emerald-400 font-semibold"
                    style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.55rem" }}
                  >
                    +{v.delta}
                  </span>
                )}
              </span>
            ))}
          </div>
          {/* Version rows */}
          <div className="space-y-1">
            {job.profileVersions!.map((v, vi) => (
              <div key={v.id} className="flex items-center justify-between py-2 px-3 rounded-sm border border-border/30 bg-muted/10 hover:bg-muted/20 transition-colors text-xs">
                <div className="flex items-center gap-2.5">
                  <span
                    className="text-foreground font-medium"
                    style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em" }}
                  >
                    v{job.profileVersions!.length - vi}
                  </span>
                  <MatchScoreBadge score={v.score} />
                  {v.delta != null && v.delta > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">+{v.delta}</span>
                  )}
                  <span className="text-muted-foreground">
                    {new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                {v.resumes.length > 0 && (
                  <div className="flex gap-1">
                    {v.resumes.map((r) => (
                      <button key={r.id} onClick={(e) => { e.stopPropagation(); onSetPreviewResume(r.id, job); }}>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-sm border border-border/40 bg-card hover:bg-primary/5 hover:border-primary/20 transition-colors cursor-pointer text-muted-foreground hover:text-primary"
                          style={{ fontFamily: "var(--font-dm-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {r.format}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export section */}
      <div className="px-6 mt-5 pb-6">
        <div className="section-divider mb-4" />
        <p
          className="text-muted-foreground mb-3 flex items-center gap-1.5"
          style={{
            fontFamily: "var(--font-dm-mono)",
            fontSize: "0.6rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          <Sparkles className="w-3 h-3" />
          Export Resume
        </p>
        {/* Email selector */}
        {profileEmails.length > 1 && (
          <div className="flex items-center gap-2 mb-3">
            <label
              className="text-muted-foreground shrink-0"
              style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Email:
            </label>
            <select
              value={selectedEmail || profileEmails[0]}
              onChange={(e) => onSetSelectedEmail(e.target.value)}
              className="text-xs border border-border rounded-sm px-2.5 py-1.5 bg-background text-foreground"
            >
              {profileEmails.map((email) => (
                <option key={email} value={email}>{email}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {(["pdf", "docx"] as const).map((fmt) => {
            const alreadyHas = jobHasResumeFormat(fmt);
            const label = fmt.toUpperCase();
            const isThisGenerating = generatingFormat === fmt;
            return (
              <span key={fmt} className="inline-flex items-center gap-1">
                <Button
                  variant={alreadyHas ? "outline" : "default"}
                  size="sm"
                  className={`gap-1.5 rounded-sm text-xs transition-all ${isThisGenerating ? "min-w-[140px]" : ""}`}
                  disabled={generatingFormat !== null}
                  onClick={() => {
                    if (alreadyHas) {
                      // Open the latest resume of this format
                      const fmtResumes = allResumes.filter((r) => r.format === fmt);
                      if (fmtResumes.length > 0) {
                        onSetPreviewResume(fmtResumes[0].id, job);
                      }
                    } else {
                      onHandleGenerateResume(job, fmt);
                    }
                  }}
                >
                  {isThisGenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : alreadyHas ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {isThisGenerating ? `Generating ${label}...` : alreadyHas ? `${label}` : `Generate ${label}`}
                </Button>
                {alreadyHas && !generatingFormat && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 rounded-sm text-xs h-8 px-2 text-muted-foreground hover:text-primary"
                    onClick={() => onHandleGenerateResume(job, fmt)}
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                )}
              </span>
            );
          })}
        </div>
        {/* Generation progress */}
        {generatingFormat && (
          <div className="mt-3 anim-fade-up">
            <div className="flex items-center gap-2 mb-1.5">
              <p
                className="text-primary"
                style={{
                  fontFamily: "var(--font-dm-mono)",
                  fontSize: "0.55rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Tailoring resume with AI
                <span className="inline-flex ml-1 gap-px">
                  <span className="anim-dot-1">.</span>
                  <span className="anim-dot-2">.</span>
                  <span className="anim-dot-3">.</span>
                </span>
              </p>
            </div>
            <div className="h-0.5 bg-border/30 rounded-full overflow-hidden max-w-xs">
              <div className="h-full w-2/5 bg-primary/50 rounded-full anim-progress-bar" />
            </div>
          </div>
        )}
      </div>

      {/* PDF Versions — all versions as scrollable thumbnails */}
      {allResumes.filter((r) => r.format === "pdf").length > 0 && (
        <div className="px-6 mt-2 pb-6">
          <div className="section-divider mb-4" />
          <p
            className="text-muted-foreground mb-3 flex items-center gap-1.5"
            style={{
              fontFamily: "var(--font-dm-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <FileText className="w-3 h-3" />
            Generated PDFs
            <span className="text-muted-foreground/60 ml-1">({allResumes.filter((r) => r.format === "pdf").length})</span>
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {allResumes.filter((r) => r.format === "pdf").map((pdf, i) => (
              <div key={pdf.id} className="shrink-0">
                <button
                  className="block w-[180px] border border-border/50 rounded-sm overflow-hidden bg-muted/10 hover:border-primary/30 transition-colors group/pdf text-left"
                  onClick={(e) => { e.stopPropagation(); onSetPreviewResume(pdf.id, job); }}
                >
                  <iframe
                    src={`/api/resume/download/${pdf.id}?inline=1`}
                    sandbox="allow-same-origin"
                    className="w-full h-[230px] border-0 pointer-events-none scale-100"
                    title={`Resume version ${i + 1}`}
                    tabIndex={-1}
                  />
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-t border-border/30 bg-card group-hover/pdf:bg-primary/5 transition-colors">
                    <span
                      className="text-muted-foreground group-hover/pdf:text-primary transition-colors truncate"
                      style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.45rem", letterSpacing: "0.06em", textTransform: "uppercase" }}
                    >
                      {i === 0 ? "Latest" : new Date(pdf.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <Eye className="w-2.5 h-2.5 shrink-0 text-muted-foreground group-hover/pdf:text-primary" />
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jobUrls, setJobUrls] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [selectedModel, setSelectedModel] = useState("sonnet");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<
    Record<string, MatchResult>
  >({});
  const [matchLoading, setMatchLoading] = useState<Record<string, boolean>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatJob, setChatJob] = useState<Job | null>(null);
  const [versionSavedForJob, setVersionSavedForJob] = useState<string | null>(null);
  const [autoApplyTips, setAutoApplyTips] = useState(false);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null); // "jobId:format"
  const [profileEmails, setProfileEmails] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string>("");
  const [previewResume, setPreviewResume] = useState<{
    resumes: Array<{ id: string; format: string; createdAt: string }>;
    currentIndex: number;
  } | null>(null);
  const [deletingNoSponsorship, setDeletingNoSponsorship] = useState(false);
  const [hideApplied, setHideApplied] = useState(true);
  const [hideNoSponsorship, setHideNoSponsorship] = useState(true);
  const [gapAggregation, setGapAggregation] = useState<{
    aggregatedGaps: Array<{ gap: string; frequency: number; severity: "critical" | "important" | "specific"; jobs: string[]; relatedTerms: string[] }>;
    leverageScores: Array<{ skill: string; jobsUnlocked: number; jobs: string[]; estimatedImpact: "high" | "medium" | "low" }>;
    terminologyOverlap: Array<{ term: string; variants: string[]; frequency: number }>;
    summary: string;
  } | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [showGapPanel, setShowGapPanel] = useState(false);
  const jobListRef = useScrollReveal<HTMLElement>([jobs]);

  async function fetchJobs(p: number) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
    if (hideApplied) params.set("excludeApplied", "true");
    if (hideNoSponsorship) params.set("excludeNoSponsorship", "true");
    const res = await fetch(`/api/jobs?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setJobs(data.jobs);
    setTotalJobs(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  async function handleGapAnalysis() {
    setGapLoading(true);
    try {
      const matchedJobIds = jobs
        .filter((j) => j.matchResult)
        .map((j) => j.id);
      const res = await fetch("/api/jobs/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: matchedJobIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      setGapAggregation(data);
      setShowGapPanel(true);
    } catch (err) {
      toast.error(`Gap analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setGapLoading(false);
    }
  }

  async function handleDeleteNoSponsorship() {
    const noSponsorIds = jobs.filter((j) => j.sponsorship === "unavailable").map((j) => j.id);
    if (noSponsorIds.length === 0) {
      toast.info("No jobs without sponsorship on this page");
      return;
    }
    if (!confirm(`Delete ${noSponsorIds.length} job${noSponsorIds.length > 1 ? "s" : ""} marked "No Sponsorship"?`)) return;
    setDeletingNoSponsorship(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: noSponsorIds }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      const data = await res.json();
      toast.success(`Deleted ${data.deleted} job${data.deleted !== 1 ? "s" : ""}`);
      await fetchJobs(page);
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeletingNoSponsorship(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams({ page: "1", pageSize: String(PAGE_SIZE) });
    if (hideApplied) params.set("excludeApplied", "true");
    if (hideNoSponsorship) params.set("excludeNoSponsorship", "true");
    Promise.all([
      fetch(`/api/jobs?${params}`).then((r) => r.json()),
      fetch("/api/profile").then((r) => r.ok ? r.json() : null),
    ])
      .then(([j, p]) => {
        setJobs(j.jobs || []);
        setTotalJobs(j.total || 0);
        setTotalPages(j.totalPages || 1);
        setPage(j.page || 1);
        setHasProfile(!!p);
        if (p) {
          const emails: string[] = [];
          if (p.email) emails.push(p.email);
          if (p.additionalEmails) {
            try {
              const extra = JSON.parse(p.additionalEmails);
              if (Array.isArray(extra)) emails.push(...extra);
            } catch { /* ignore */ }
          }
          setProfileEmails(emails);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideApplied, hideNoSponsorship]);

  // Poll for jobs still being analyzed or awaiting auto-match scoring
  const pendingIdsRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    // Track jobs that are still analyzing
    const analyzing = jobs.filter((j) => j.title === "Analyzing...");
    analyzing.forEach((j) => pendingIdsRef.current.add(j.id));

    // Nothing to poll for
    if (pendingIdsRef.current.size === 0) return;

    const interval = setInterval(async () => {
      try {
        const pollParams = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (hideApplied) pollParams.set("excludeApplied", "true");
        if (hideNoSponsorship) pollParams.set("excludeNoSponsorship", "true");
        const res = await fetch(`/api/jobs?${pollParams}`);
        if (!res.ok) return;
        const data = await res.json();
        const freshJobs: Job[] = data.jobs || [];
        setJobs(freshJobs);
        setTotalJobs(data.total || 0);
        setTotalPages(data.totalPages || 1);

        // Remove jobs from pending once the full auto-pipeline has completed
        for (const job of freshJobs) {
          if (!pendingIdsRef.current.has(job.id)) continue;

          // Failed analysis — stop polling for this job
          if (job.title.startsWith("Analysis Failed")) {
            pendingIdsRef.current.delete(job.id);
            continue;
          }

          // Still analyzing — keep polling
          if (job.title === "Analyzing...") continue;

          // Has match result — check if pipeline is done
          if (job.matchResult) {
            try {
              const score = JSON.parse(job.matchResult)?.overallScore ?? 0;
              // Score < 65: pipeline stops after match, we're done
              // Score >= 65: pipeline continues (tips + rescore + maybe PDF)
              //   → wait until profileVersions appear (tips applied & version saved)
              if (score < 65 || (job.profileVersions && job.profileVersions.length > 0)) {
                pendingIdsRef.current.delete(job.id);
              }
            } catch {
              pendingIdsRef.current.delete(job.id);
            }
          }
        }

        if (pendingIdsRef.current.size === 0) clearInterval(interval);
      } catch {
        // silently retry next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, page]);

  const [retryingJobs, setRetryingJobs] = useState<Record<string, boolean>>({});

  async function handleRetryAnalysis(job: Job) {
    setRetryingJobs((prev) => ({ ...prev, [job.id]: true }));
    try {
      // Re-submit the job description for analysis by deleting and re-creating
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: job.description }),
      });
      if (!res.ok) {
        const err = await res.json();
        // If duplicate, that's fine — the original still exists
        if (!err.duplicate) throw new Error(err.error);
      }
      // Delete the failed job
      await fetch("/api/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [job.id] }),
      });
      toast.success("Re-analyzing job...");
      await fetchJobs(page);
    } catch (err) {
      toast.error(`Retry failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRetryingJobs((prev) => ({ ...prev, [job.id]: false }));
    }
  }

  async function fetchMatch(jobId: string, force = false) {
    if (matchLoading[jobId]) return;
    if (!force && matchResults[jobId]) return;

    setMatchLoading((prev) => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch("/api/jobs/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, force }),
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

  function openChatAndApplyTips(job: Job) {
    setChatJob(job);
    setAutoApplyTips(true);
    setChatOpen(true);
  }

  async function handleGenerateResume(job: Job, format: "pdf" | "docx") {
    setGeneratingFor(`${job.id}:${format}`);
    try {
      // Check if the best version already has a resume in this format
      const bestVersion = job.profileVersions?.[0];
      const body: Record<string, string> = { jobId: job.id, format };
      if (bestVersion) {
        body.profileVersionId = bestVersion.id;
      }
      if (selectedEmail) {
        body.emailOverride = selectedEmail;
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

      // Open preview — show this resume (full carousel available on re-expand)
      setPreviewResume({ resumes: [{ id: data.id, format, createdAt: new Date().toISOString() }], currentIndex: 0 });
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

  function openResumePreview(resumeId: string, job: Job) {
    // Collect all resumes for the job, deduped, sorted newest first
    const seenIds = new Set<string>();
    const all: Array<{ id: string; format: string; createdAt: string }> = [];
    for (const r of [...(job.profileVersions?.flatMap((v) => v.resumes) ?? []), ...job.resumes]) {
      if (!seenIds.has(r.id)) { seenIds.add(r.id); all.push(r); }
    }
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const idx = all.findIndex((r) => r.id === resumeId);
    setPreviewResume({ resumes: all, currentIndex: idx >= 0 ? idx : 0 });
  }

  function toggleExpand(jobId: string) {
    if (expandedJob === jobId) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobId);
      // Load cached match from server data if available (no API call)
      if (!matchResults[jobId]) {
        const job = jobs.find((j) => j.id === jobId);
        if (job?.matchResult) {
          try {
            const cached = JSON.parse(job.matchResult);
            if (cached?.overallScore != null) {
              setMatchResults((prev) => ({ ...prev, [jobId]: cached }));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }
  }

  async function handleSubmit(payload: {
    urls?: string;
    description?: string;
  }) {
    setSubmitting(true);
    try {
      if (payload.urls) {
        // Parse multiple URLs from text (one per line, comma, or space separated)
        const urls = payload.urls
          .split(/[\n,]+/)
          .map((u) => u.trim())
          .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

        if (urls.length === 0) {
          throw new Error("No valid URLs found. Enter URLs starting with http:// or https://");
        }

        if (urls.length === 1) {
          // Single URL — use the original endpoint
          const res = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urls[0], aiModel: selectedModel }),
          });
          if (!res.ok) {
            const err = await res.json();
            if (res.status === 409) {
              toast.warning(err.error || "This job already exists");
              setJobUrls("");
              return;
            }
            throw new Error(err.error);
          }
          await fetchJobs(1);
          setJobUrls("");
          toast.success("Job added — analyzing in the background...");
        } else {
          // Multiple URLs — use batch endpoint
          const res = await fetch("/api/jobs/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls, aiModel: selectedModel }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
          }
          const data = await res.json();
          await fetchJobs(1);
          setJobUrls("");
          const parts: string[] = [];
          if (data.created > 0) parts.push(`${data.created} added`);
          if (data.duplicates > 0) parts.push(`${data.duplicates} duplicate${data.duplicates !== 1 ? "s" : ""} skipped`);
          if (data.failed > 0) parts.push(`${data.failed} failed`);
          if (data.created > 0) {
            toast.success(parts.join(", ") + " — analyzing in background...");
          } else {
            toast.warning(parts.join(", "));
          }
        }
      } else if (payload.description) {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: payload.description, aiModel: selectedModel }),
        });
        if (!res.ok) {
          const err = await res.json();
          if (res.status === 409) {
            toast.warning(err.error || "This job description already exists");
            setJobDescription("");
            return;
          }
          throw new Error(err.error);
        }
        await fetchJobs(1);
        setJobDescription("");
        toast.success("Job added — analyzing in the background...");
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
    // Check cached matchResult from API
    if (job.matchResult) {
      try {
        const cached = JSON.parse(job.matchResult);
        if (cached?.overallScore) return cached.overallScore;
      } catch { /* ignore */ }
    }
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
    <div className={`space-y-0 transition-all duration-200 `}>
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
            <TabsContent value="url" className="mt-4">
              <Label className="text-sm mb-2 block">Job Posting URLs</Label>
              <div className="relative group/urls">
                <Textarea
                  placeholder={"Paste one or more job URLs, one per line:\nhttps://jobs.lever.co/company/...\nhttps://boards.greenhouse.io/company/..."}
                  rows={3}
                  value={jobUrls}
                  onChange={(e) => setJobUrls(e.target.value)}
                  className="font-mono text-[13px] leading-relaxed bg-background/60 border-border/40 placeholder:text-muted-foreground/35 focus-visible:ring-primary/30 resize-none"
                />
                {/* URL count indicator */}
                {(() => {
                  const count = jobUrls.split(/[\n,]+/).map(u => u.trim()).filter(u => u.startsWith("http")).length;
                  return count > 0 ? (
                    <div className="absolute top-2 right-2 pointer-events-none">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold border transition-colors ${
                          count > 1
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-muted text-muted-foreground border-border/40"
                        }`}
                        style={{ fontFamily: "var(--font-dm-mono)", letterSpacing: "0.06em" }}
                      >
                        {count} URL{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="flex items-center justify-between gap-3 mt-3">
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Paste multiple URLs to batch-import. Lever, Greenhouse, Ashby, and most job boards supported.
                </p>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Select value={selectedModel} onValueChange={(v) => v && setSelectedModel(v)}>
                    <SelectTrigger className="w-[130px] h-8 text-xs shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-xs">
                          {m.label} <span className="text-muted-foreground ml-1">({m.description})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => handleSubmit({ urls: jobUrls })}
                    disabled={submitting || !jobUrls.trim()}
                    className="shrink-0 gap-2 flex-1 sm:flex-initial"
                  >
                    {submitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Adding...
                      </>
                    ) : (() => {
                      const count = jobUrls.split(/[\n,]+/).map(u => u.trim()).filter(u => u.startsWith("http")).length;
                      return count > 1 ? `Add ${count} Jobs` : "Add Job";
                    })()}
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="text" className="space-y-3 mt-4">
              <Label className="text-sm">Job Description</Label>
              <Textarea
                placeholder="Paste the full job description here..."
                rows={8}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Select value={selectedModel} onValueChange={(v) => v && setSelectedModel(v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {m.label} <span className="text-muted-foreground ml-1">({m.description})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() =>
                    handleSubmit({ description: jobDescription })
                  }
                  disabled={submitting || !jobDescription}
                >
                  {submitting ? "Analyzing..." : "Add Job"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </section>

      {/* ── Jobs Table ── */}
      {jobs.length > 0 ? (
        <section className="pt-8 anim-fade-up-2" ref={jobListRef}>
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <p className="text-muted-foreground" style={monoStyle}>
              Saved Jobs · {totalJobs} position{totalJobs !== 1 ? "s" : ""}
              {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant={hideApplied ? "default" : "outline"}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setHideApplied((v) => !v)}
              >
                {hideApplied ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                Applied
              </Button>
              <Button
                variant={hideNoSponsorship ? "default" : "outline"}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setHideNoSponsorship((v) => !v)}
              >
                {hideNoSponsorship ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                No Sponsorship
              </Button>
              {jobs.filter((j) => j.matchResult).length >= 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleGapAnalysis}
                  disabled={gapLoading}
                >
                  {gapLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Target className="w-3.5 h-3.5" />
                  )}
                  Cross-Job Analysis
                </Button>
              )}
              {!hideNoSponsorship && jobs.some((j) => j.sponsorship === "unavailable") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                  onClick={handleDeleteNoSponsorship}
                  disabled={deletingNoSponsorship}
                >
                  {deletingNoSponsorship ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete No Sponsorship
                </Button>
              )}
            </div>
          </div>

          {/* Gap Aggregation Panel */}
          {showGapPanel && gapAggregation && (
            <div className="mb-6 border border-border rounded-sm bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground" style={monoStyle}>
                    Cross-Job Gap Analysis
                  </p>
                  <p className="text-sm text-foreground/80 mt-1 leading-relaxed">{gapAggregation.summary}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowGapPanel(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border/40">
                {/* Critical Gaps */}
                <div className="bg-card p-4">
                  <p className="text-muted-foreground mb-3 flex items-center gap-1.5" style={monoStyle}>
                    Gap Frequency
                  </p>
                  <div className="space-y-2">
                    {gapAggregation.aggregatedGaps.slice(0, 8).map((g) => (
                      <div key={g.gap} className="flex items-start gap-2">
                        <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded-sm text-[9px] font-semibold uppercase tracking-wider border ${
                          g.severity === "critical" ? "bg-red-50 text-red-700 border-red-200/50 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/30"
                          : g.severity === "important" ? "bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/30"
                          : "bg-muted text-muted-foreground border-border/50"
                        }`} style={{ fontFamily: "var(--font-dm-mono)" }}>
                          {g.frequency}x
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] text-foreground font-medium leading-snug">{g.gap}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{g.jobs.join(", ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Leverage Scores */}
                <div className="bg-card p-4">
                  <p className="text-muted-foreground mb-3 flex items-center gap-1.5" style={monoStyle}>
                    <Zap className="w-3 h-3" />
                    Skills to Develop
                  </p>
                  <div className="space-y-2">
                    {gapAggregation.leverageScores.slice(0, 6).map((l) => (
                      <div key={l.skill} className="flex items-start gap-2">
                        <ImpactBadge impact={l.estimatedImpact} />
                        <div className="min-w-0">
                          <p className="text-[11px] text-foreground font-medium leading-snug">{l.skill}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Unlocks {l.jobsUnlocked} job{l.jobsUnlocked !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Terminology Overlap */}
                <div className="bg-card p-4">
                  <p className="text-muted-foreground mb-3 flex items-center gap-1.5" style={monoStyle}>
                    <ArrowRight className="w-3 h-3" />
                    Common Terms
                  </p>
                  <div className="space-y-1.5">
                    {gapAggregation.terminologyOverlap.slice(0, 8).map((t) => (
                      <div key={t.term} className="flex items-baseline gap-2 text-[11px] leading-snug">
                        <span className="text-primary font-medium shrink-0">{t.term}</span>
                        <span className="text-muted-foreground/40 shrink-0">{t.frequency}x</span>
                        <span className="text-muted-foreground truncate">{t.variants.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Mobile card stack (sm:hidden) ── */}
          <div className="sm:hidden space-y-2">
            {sortedJobs.map((job, idx) => {
              const isExpanded = expandedJob === job.id;
              const isFailed = job.title === "Analysis Failed — Click to Retry";
              const isAnalyzing = job.title === "Analyzing..." || isFailed;
              const bestScore = getBestScore(job);
              const hasVersions = (job.profileVersions?.length ?? 0) > 0;

              return (
                <div key={job.id} className="scroll-reveal" style={{ "--reveal-delay": `${idx * 0.04}s` } as React.CSSProperties}>
                <div
                  className={cn(
                    "border border-border rounded-sm cursor-pointer transition-colors",
                    isExpanded ? "bg-accent/30" : "hover:bg-accent/10"
                  )}
                >
                  {/* Card header — always visible */}
                  <div
                    className="p-4 flex items-start gap-3"
                    onClick={() => { if (!isAnalyzing || isFailed) { if (isFailed) handleRetryAnalysis(job); else toggleExpand(job.id); } }}
                  >
                    {/* Company avatar */}
                    <div
                      className={cn(
                        "w-9 h-9 rounded-sm flex items-center justify-center shrink-0 font-bold text-sm",
                        isFailed
                          ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                          : isAnalyzing
                            ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                            : "bg-primary/8 text-primary"
                      )}
                      style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "1rem" }}
                    >
                      {isAnalyzing && !isFailed
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : (job.company || job.title)[0]?.toUpperCase()}
                    </div>

                    {/* Job info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {isFailed ? (
                          <span className="text-red-600 dark:text-red-400">
                            {retryingJobs[job.id] ? "Re-analyzing..." : "Analysis Failed — Tap to Retry"}
                          </span>
                        ) : job.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{job.company}</div>

                      {/* Badges row */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {bestScore !== null && (
                          <MatchScoreBadge score={bestScore} />
                        )}
                        {job.sponsorship === "available" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                            <ShieldCheck className="w-2.5 h-2.5" /> Sponsors
                          </Badge>
                        )}
                        {job.sponsorship === "unavailable" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 font-semibold">
                            <ShieldAlert className="w-2.5 h-2.5" /> No Sponsorship
                          </Badge>
                        )}
                        {job.aiModel && job.aiModel !== "sonnet" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5">
                            <Cpu className="w-2.5 h-2.5" /> {job.aiModel}
                          </Badge>
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

                    {/* Right side: chat button + chevron */}
                    <div className="flex items-center gap-1 shrink-0">
                      {hasProfile && !isAnalyzing && (
                        <Button
                          variant={chatOpen && chatJob?.id === job.id ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (chatOpen && chatJob?.id === job.id) setChatOpen(false);
                            else openChatForJob(job);
                          }}
                          title="Resume advisor"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform mt-0.5",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                  </div>

                  {/* Expanded detail — smooth expand/collapse */}
                  <div className={cn("expand-grid", isExpanded && "expanded")}>
                    <div className="expand-inner">
                      {isExpanded && (
                        <ExpandedJobDetail
                          job={job}
                          match={matchResults[job.id]}
                          isMatchLoading={matchLoading[job.id] || false}
                          hasProfile={hasProfile}
                          hasVersions={hasVersions}
                          generatingFor={generatingFor}
                          profileEmails={profileEmails}
                          selectedEmail={selectedEmail}
                          onSetExpandedJob={setExpandedJob}
                          onFetchMatch={fetchMatch}
                          onOpenChatAndApplyTips={openChatAndApplyTips}
                          onHandleGenerateResume={handleGenerateResume}
                          onSetSelectedEmail={setSelectedEmail}
                          onSetPreviewResume={openResumePreview}
                        />
                      )}
                    </div>
                  </div>

                  {/* Version saved indicator */}
                  {versionSavedForJob === job.id && (
                    <a
                      href="/versions"
                      className="flex items-center gap-1 px-4 pb-3 text-[10px] text-emerald-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <History className="w-3 h-3" /> Version saved
                    </a>
                  )}
                </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (hidden on mobile) ── */}
          <div className="hidden sm:block border border-border rounded-sm overflow-hidden">
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
                {sortedJobs.map((job, idx) => {
                  const isExpanded = expandedJob === job.id;
                  const isFailed = job.title === "Analysis Failed — Click to Retry";
              const isAnalyzing = job.title === "Analyzing..." || isFailed;
                  const bestScore = getBestScore(job);
                  const hasVersions = (job.profileVersions?.length ?? 0) > 0;
                  const totalResumes = job.resumes.length;

                  return (
                    <React.Fragment key={job.id}>
                    <TableRow
                      className={`group cursor-pointer ${isAnalyzing && !isFailed ? "opacity-60" : ""} ${isExpanded ? "border-b-0" : ""}`}
                      onClick={() => { if (isFailed) handleRetryAnalysis(job); else if (!isAnalyzing) toggleExpand(job.id); }}
                    >
                      {/* Title */}
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 font-bold text-xs ${
                              isFailed
                                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                                : isAnalyzing
                                  ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                                  : "bg-primary/8 text-primary"
                            }`}
                            style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "0.9rem" }}
                          >
                            {isAnalyzing && !isFailed ? <Loader2 className="w-3 h-3 animate-spin" /> : job.company.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                              {isFailed ? (
                                <span className="text-red-600 dark:text-red-400">
                                  {retryingJobs[job.id] ? "Re-analyzing..." : "Analysis Failed — Click to Retry"}
                                </span>
                              ) : job.title === "Analyzing..." ? "Analyzing..." : job.title}
                            </p>
                            <p className="text-xs text-muted-foreground sm:hidden">{job.company}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {job.sponsorship === "available" && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                                  <ShieldCheck className="w-2.5 h-2.5" /> Sponsors
                                </Badge>
                              )}
                              {job.sponsorship === "unavailable" && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 font-semibold">
                                  <ShieldAlert className="w-2.5 h-2.5" /> No Sponsorship
                                </Badge>
                              )}
                              {job.aiModel && job.aiModel !== "sonnet" && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-sm gap-0.5">
                                  <Cpu className="w-2.5 h-2.5" /> {job.aiModel}
                                </Badge>
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
                        ) : matchLoading[job.id] ? (
                          <span className="flex gap-0.5 justify-center">
                            <span className="w-1 h-1 rounded-full bg-primary/50 anim-dot-1" />
                            <span className="w-1 h-1 rounded-full bg-primary/50 anim-dot-2" />
                            <span className="w-1 h-1 rounded-full bg-primary/50 anim-dot-3" />
                          </span>
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
                        {isFailed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800"
                            onClick={() => handleRetryAnalysis(job)}
                            disabled={retryingJobs[job.id]}
                          >
                            {retryingJobs[job.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                            Retry
                          </Button>
                        ) : isAnalyzing ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <Loader2 className="w-3 h-3 animate-spin" />
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            {hasProfile && (
                              <Button
                                variant={chatOpen && chatJob?.id === job.id ? "default" : "ghost"}
                                size="icon"
                                className="h-8 w-8 sm:h-7 sm:w-7"
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
                                className="h-8 w-8 sm:h-7 sm:w-7"
                                onClick={() => setExpandedJob(null)}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 sm:h-7 sm:w-7"
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
                    {/* Inline expanded detail panel — immediately after this row */}
                    {isExpanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="p-0 whitespace-normal">
                            <ExpandedJobDetail
                              job={job}
                              match={matchResults[job.id]}
                              isMatchLoading={matchLoading[job.id] || false}
                              hasProfile={hasProfile}
                              hasVersions={hasVersions}
                              generatingFor={generatingFor}
                              profileEmails={profileEmails}
                              selectedEmail={selectedEmail}
                              onSetExpandedJob={setExpandedJob}
                              onFetchMatch={fetchMatch}
                              onOpenChatAndApplyTips={openChatAndApplyTips}
                              onHandleGenerateResume={handleGenerateResume}
                              onSetSelectedEmail={setSelectedEmail}
                              onSetPreviewResume={openResumePreview}
                            />
                          </TableCell>
                        </TableRow>
                    )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

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
        autoApplyTips={autoApplyTips}
        onAutoApplyConsumed={() => setAutoApplyTips(false)}
      />

      {/* Resume Preview Modal (Carousel) */}
      <Dialog open={!!previewResume} onOpenChange={(open: boolean) => { if (!open) setPreviewResume(null); }}>
        <DialogContent className="!max-w-5xl w-[96vw] !h-[92vh] !p-0 !gap-0 overflow-hidden flex flex-col !rounded-lg" showCloseButton={false}>
          {(() => {
            const cur = previewResume?.resumes[previewResume.currentIndex];
            const total = previewResume?.resumes.length ?? 0;
            const idx = previewResume?.currentIndex ?? 0;
            const hasPrev = idx > 0;
            const hasNext = idx < total - 1;
            return (
              <>
                {/* Toolbar */}
                <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between shrink-0 bg-card">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-primary/10 flex items-center justify-center rounded">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <DialogTitle className="text-sm font-medium leading-none">
                        Resume Preview
                      </DialogTitle>
                      <p className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        {cur?.format === "pdf" ? "PDF Document" : "DOCX Document"}
                        {total > 1 && ` \u00b7 ${idx + 1} of ${total}`}
                        {cur?.createdAt && ` \u00b7 ${new Date(cur.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Carousel nav */}
                    {total > 1 && (
                      <>
                        <button
                          onClick={() => hasPrev && setPreviewResume({ ...previewResume!, currentIndex: idx - 1 })}
                          disabled={!hasPrev}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                          title="Newer version"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-muted-foreground tabular-nums" style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem" }}>
                          {idx + 1}/{total}
                        </span>
                        <button
                          onClick={() => hasNext && setPreviewResume({ ...previewResume!, currentIndex: idx + 1 })}
                          disabled={!hasNext}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                          title="Older version"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="w-px h-5 bg-border/50 mx-1" />
                      </>
                    )}
                    {cur?.format === "pdf" && (
                      <a
                        href={cur ? `/api/resume/download/${cur.id}?inline=1` : "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs border border-border/50 hover:bg-muted/50 hover:border-border transition-all text-muted-foreground hover:text-foreground"
                        style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        New Tab
                      </a>
                    )}
                    <a
                      href={cur ? `/api/resume/download/${cur.id}` : "#"}
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/30 transition-all text-primary"
                      style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                    <div className="w-px h-5 bg-border/50 mx-1" />
                    <button
                      onClick={() => setPreviewResume(null)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <span className="sr-only">Close</span>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>
                {/* Document viewport */}
                <div className="flex-1 min-h-0 bg-muted/30">
                  {cur?.format === "pdf" ? (
                    <iframe
                      key={cur.id}
                      src={`/api/resume/download/${cur.id}?inline=1`}
                      className="w-full h-full border-0"
                      title="Resume preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-5 text-muted-foreground">
                      <div className="w-16 h-16 rounded-lg bg-muted/50 border border-border/30 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <div className="text-center">
                        <p
                          className="text-foreground/70 mb-1"
                          style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "1.25rem" }}
                        >
                          DOCX preview unavailable
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">Word documents cannot be rendered in the browser</p>
                      </div>
                      <a
                        href={cur ? `/api/resume/download/${cur.id}` : "#"}
                        download
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download DOCX
                      </a>
                    </div>
                  )}
                </div>
                {/* Vermillion accent bar */}
                <div className="h-0.5 bg-primary shrink-0" />
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
