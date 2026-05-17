"use client";

import React from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  labelForReason,
  type RejectionReasonKey,
} from "@/lib/rejection-reasons";

// Single source of truth for reason → chip/bar colors.
// Keys mirror RejectionReasonKey values plus a synthetic "unspecified" bucket.
export const REASON_COLORS: Record<
  RejectionReasonKey | "unspecified",
  { chip: string; bar: string }
> = {
  role_filled:       { chip: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700",       bar: "bg-gray-400 dark:bg-gray-600" },
  underqualified:    { chip: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800", bar: "bg-orange-400 dark:bg-orange-600" },
  salary_mismatch:   { chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800", bar: "bg-amber-400 dark:bg-amber-600" },
  location:          { chip: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",       bar: "bg-blue-400 dark:bg-blue-600" },
  visa:              { chip: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800", bar: "bg-purple-400 dark:bg-purple-600" },
  failed_technical:  { chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",             bar: "bg-red-400 dark:bg-red-600" },
  failed_behavioral: { chip: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",       bar: "bg-rose-400 dark:bg-rose-600" },
  ghosted:           { chip: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700", bar: "bg-slate-400 dark:bg-slate-600" },
  withdrew:          { chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800", bar: "bg-emerald-400 dark:bg-emerald-600" },
  other:             { chip: "bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700", bar: "bg-neutral-400 dark:bg-neutral-600" },
  unspecified:       { chip: "bg-muted text-muted-foreground border-dashed border-border", bar: "bg-muted-foreground/30" },
};

export interface RejectionReasonChipProps {
  reason: RejectionReasonKey | null;
  onEditClick?: () => void;
  className?: string;
}

export function RejectionReasonChip({
  reason,
  onEditClick,
  className,
}: RejectionReasonChipProps) {
  const bucket = reason ?? "unspecified";
  const colors = REASON_COLORS[bucket];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-sm border font-semibold uppercase tracking-wider",
          colors.chip,
        )}
      >
        {labelForReason(reason)}
      </span>
      {onEditClick && (
        <button
          type="button"
          onClick={onEditClick}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit rejection reason"
          title="Edit rejection reason"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
