"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Minus, ArrowRight, Pencil } from "lucide-react";
import type { DiffEntry, SkillDiffResult } from "@/lib/utils/profile-diff";

const CATEGORY_LABELS: Record<string, string> = {
  language: "Languages",
  framework: "Frameworks",
  tool: "Tools",
  database: "Databases",
  cloud: "Cloud",
  soft: "Soft Skills",
};

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** Renders a structured profile diff inside a chat panel. */
export function ProfileDiffView({
  diffs,
  accentColor = "emerald",
}: {
  diffs: DiffEntry[];
  accentColor?: "emerald" | "blue" | "amber";
}) {
  const [expanded, setExpanded] = useState(true);

  if (diffs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">Minor formatting changes</p>
    );
  }

  // Group diffs by section
  const sections = new Map<string, DiffEntry[]>();
  for (const d of diffs) {
    const arr = sections.get(d.section) || [];
    arr.push(d);
    sections.set(d.section, arr);
  }

  const colors = {
    emerald: {
      added: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40",
      removed: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
      section: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
    },
    blue: {
      added: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40",
      removed: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
      section: "text-blue-600 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800",
    },
    amber: {
      added: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40",
      removed: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
      section: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800",
    },
  }[accentColor];

  return (
    <div className="space-y-2.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {diffs.length} change{diffs.length !== 1 ? "s" : ""} across {sections.size} section{sections.size !== 1 ? "s" : ""}
      </button>

      {expanded && (
        <div className="space-y-3">
          {Array.from(sections.entries()).map(([section, entries]) => (
            <div key={section}>
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${colors.section}`}>
                {section}
              </p>
              <div className="space-y-1.5">
                {entries.map((entry, i) => (
                  <DiffEntryRow key={i} entry={entry} colors={colors} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffEntryRow({
  entry,
  colors,
}: {
  entry: DiffEntry;
  colors: { added: string; removed: string; section: string; border: string };
}) {
  const [showFull, setShowFull] = useState(false);

  if (entry.type === "field") {
    return (
      <div className="text-xs flex items-center gap-1.5 flex-wrap">
        <Pencil className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
        <span className="font-medium text-muted-foreground">{entry.label}:</span>
        <span className={`line-through ${colors.removed} px-1 rounded text-[11px]`}>
          {truncate(entry.oldValue || "", 30)}
        </span>
        <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
        <span className={`${colors.added} px-1 rounded text-[11px]`}>
          {truncate(entry.newValue || "", 30)}
        </span>
      </div>
    );
  }

  if (entry.type === "text") {
    const isLong = (entry.oldValue || "").length > 80 || (entry.newValue || "").length > 80;
    return (
      <div className="space-y-1">
        {entry.oldValue && (
          <div className={`text-[11px] px-2 py-1 rounded ${colors.removed} leading-relaxed`}>
            <span className="font-mono text-[10px] mr-1">-</span>
            {showFull ? entry.oldValue : truncate(entry.oldValue, 120)}
          </div>
        )}
        {entry.newValue && (
          <div className={`text-[11px] px-2 py-1 rounded ${colors.added} leading-relaxed`}>
            <span className="font-mono text-[10px] mr-1">+</span>
            {showFull ? entry.newValue : truncate(entry.newValue, 120)}
          </div>
        )}
        {isLong && !showFull && (
          <button
            onClick={() => setShowFull(true)}
            className="text-[10px] text-primary hover:underline"
          >
            Show full text
          </button>
        )}
      </div>
    );
  }

  if (entry.type === "list") {
    return (
      <div className="space-y-0.5">
        <p className="text-[11px] font-medium text-muted-foreground">{entry.label}</p>
        {entry.removed?.map((item, j) => (
          <div key={`r${j}`} className={`text-[11px] px-2 py-0.5 rounded flex items-start gap-1.5 ${colors.removed}`}>
            <Minus className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="line-through">{truncate(item, 100)}</span>
          </div>
        ))}
        {entry.added?.map((item, j) => (
          <div key={`a${j}`} className={`text-[11px] px-2 py-0.5 rounded flex items-start gap-1.5 ${colors.added}`}>
            <Plus className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{truncate(item, 100)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (entry.type === "badges") {
    return (
      <div className="space-y-1">
        {entry.removed && entry.removed.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {entry.removed.map((item, j) => (
              <span key={`r${j}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 line-through">
                <Minus className="w-2.5 h-2.5" />
                {item}
              </span>
            ))}
          </div>
        )}
        {entry.added && entry.added.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {entry.added.map((item, j) => (
              <span key={`a${j}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Plus className="w-2.5 h-2.5" />
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

/** Renders a skills-specific diff view. */
export function SkillsDiffView({ diff }: { diff: SkillDiffResult }) {
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.recategorized.length > 0;

  if (!hasChanges) {
    return <p className="text-xs text-muted-foreground italic">No skill changes detected</p>;
  }

  return (
    <div className="space-y-2">
      {diff.added.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
            Added ({diff.added.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {diff.added.map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                <Plus className="w-2.5 h-2.5" />
                {s.name}
                <span className="text-[9px] opacity-60 ml-0.5">{CATEGORY_LABELS[s.category] || s.category}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {diff.removed.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
            Removed ({diff.removed.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {diff.removed.map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 line-through"
              >
                <Minus className="w-2.5 h-2.5" />
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {diff.recategorized.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
            Recategorized ({diff.recategorized.length})
          </p>
          <div className="space-y-0.5">
            {diff.recategorized.map((s) => (
              <div key={s.name} className="text-[11px] flex items-center gap-1 text-muted-foreground">
                <span className="font-medium">{s.name}</span>
                <span className="text-[10px] bg-muted px-1 rounded">{CATEGORY_LABELS[s.oldCategory] || s.oldCategory}</span>
                <ArrowRight className="w-2.5 h-2.5" />
                <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-1 rounded">
                  {CATEGORY_LABELS[s.newCategory] || s.newCategory}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {diff.unchanged > 0 && (
        <p className="text-[10px] text-muted-foreground">{diff.unchanged} skill{diff.unchanged !== 1 ? "s" : ""} unchanged</p>
      )}
    </div>
  );
}
