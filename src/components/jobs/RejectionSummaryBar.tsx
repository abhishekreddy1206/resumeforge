"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  REJECTION_REASONS,
  labelForReason,
  type RejectionReasonKey,
} from "@/lib/rejection-reasons";
import { REASON_COLORS } from "@/components/jobs/RejectionReasonChip";

export type SummaryFilterValue = RejectionReasonKey | "unspecified" | null;

export interface RejectionSummaryBarProps {
  jobs: Array<{ rejectionReason?: RejectionReasonKey | null }>;
  selectedReason: SummaryFilterValue;
  onSelectReason: (reason: SummaryFilterValue) => void;
}

export function RejectionSummaryBar({
  jobs,
  selectedReason,
  onSelectReason,
}: RejectionSummaryBarProps) {
  const counts = useMemo(() => {
    const map = new Map<RejectionReasonKey | "unspecified", number>();
    for (const j of jobs) {
      const key: RejectionReasonKey | "unspecified" = j.rejectionReason ?? "unspecified";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    // Stable ordering: spec'd order + unspecified at the end
    const ordered: Array<{
      key: RejectionReasonKey | "unspecified";
      label: string;
      count: number;
    }> = [];
    for (const r of REJECTION_REASONS) {
      const c = map.get(r.key) ?? 0;
      if (c > 0) ordered.push({ key: r.key, label: r.label, count: c });
    }
    const unspec = map.get("unspecified") ?? 0;
    if (unspec > 0) ordered.push({ key: "unspecified", label: "Unspecified", count: unspec });
    return ordered;
  }, [jobs]);

  const total = counts.reduce((sum, b) => sum + b.count, 0);

  if (total === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-background/30 p-4 mb-6">
      {/* Stacked bar */}
      <div className="flex w-full h-2 overflow-hidden rounded-sm">
        {counts.map((b) => (
          <div
            key={b.key}
            className={cn("h-full", REASON_COLORS[b.key].bar)}
            style={{ width: `${(b.count / total) * 100}%` }}
            title={`${b.label}: ${b.count} (${Math.round((b.count / total) * 100)}%)`}
          />
        ))}
      </div>

      {/* Legend / filter pills */}
      <div className="mt-3 flex flex-wrap gap-2">
        {counts.map((b) => {
          const isActive = selectedReason === b.key;
          const pct = Math.round((b.count / total) * 100);
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onSelectReason(isActive ? null : b.key)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border transition-colors",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-accent/40",
              )}
            >
              <span
                className={cn("inline-block w-2 h-2 rounded-sm", REASON_COLORS[b.key].bar)}
              />
              <span>{b.label}</span>
              <span className="text-[10px] opacity-70">
                {b.count} ({pct}%)
              </span>
            </button>
          );
        })}
        {selectedReason !== null && (
          <button
            type="button"
            onClick={() => onSelectReason(null)}
            className="inline-flex items-center text-xs px-2 py-1 rounded-sm border border-border hover:bg-accent/40"
          >
            Clear filter
          </button>
        )}
      </div>
    </div>
  );
}

// Re-exports for the page that consumes this — keeps imports tidy.
export { labelForReason };
