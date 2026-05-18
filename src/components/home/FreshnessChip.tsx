"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FreshnessChipProps {
  cachedAt: string | null;     // ISO string from API; null = no cache yet
  revalidating?: boolean;
  className?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  // HH:MM in the user's locale, e.g. "14:32" or "2:32 PM"
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function FreshnessChip({ cachedAt, revalidating, className }: FreshnessChipProps) {
  if (!cachedAt && !revalidating) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/80 font-mono uppercase tracking-wider",
        className,
      )}
    >
      {cachedAt && <span>· as of {formatTime(cachedAt)}</span>}
      {revalidating && (
        <span className="inline-flex items-center gap-1 text-foreground/60">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          updating…
        </span>
      )}
    </span>
  );
}
