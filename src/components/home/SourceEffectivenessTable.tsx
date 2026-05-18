"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";
import { RejectionReasonChip } from "@/components/jobs/RejectionReasonChip";
import type { SourceRow } from "@/lib/source-effectiveness";
// (RejectionReasonKey type is reached transitively via SourceRow — no separate import needed)

type SortColumn = "source" | "jobs" | "avgMatch" | "appliedPct" | "callbackPct" | "rejectedPct";
type SortDir = "asc" | "desc";

const COLUMNS: Array<{
  key: SortColumn;
  label: string;
  numeric: boolean;
}> = [
  { key: "source", label: "Source", numeric: false },
  { key: "jobs", label: "Jobs", numeric: true },
  { key: "avgMatch", label: "Avg Match", numeric: true },
  { key: "appliedPct", label: "% Applied", numeric: true },
  { key: "callbackPct", label: "% Callback", numeric: true },
  { key: "rejectedPct", label: "% Rejected", numeric: true },
];

export interface SourceEffectivenessTableProps {
  rows: SourceRow[];
  className?: string;
}

export function SourceEffectivenessTable({ rows, className }: SourceEffectivenessTableProps) {
  // Hidden if too few signals (under-5 threshold per the spec)
  const totalJobs = rows.reduce((sum, r) => sum + r.jobs, 0);
  const [sortCol, setSortCol] = useState<SortColumn>("jobs");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (totalJobs < 5) return null;

  function compareRows(a: SourceRow, b: SourceRow): number {
    // The "Other" row always sits at the bottom regardless of sort
    if (a.source === "Other" && b.source !== "Other") return 1;
    if (b.source === "Other" && a.source !== "Other") return -1;

    const av = a[sortCol];
    const bv = b[sortCol];

    // null avgMatch sorts to the end regardless of direction
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;

    let cmp: number;
    if (typeof av === "string" && typeof bv === "string") {
      cmp = av.localeCompare(bv);
    } else {
      cmp = (av as number) - (bv as number);
    }
    return sortDir === "asc" ? cmp : -cmp;
  }

  const sorted = [...rows].sort(compareRows);

  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      // Default to desc for numeric columns, asc for source (alphabetical)
      const isNumeric = COLUMNS.find((c) => c.key === col)?.numeric ?? false;
      setSortDir(isNumeric ? "desc" : "asc");
    }
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((col) => {
              const active = sortCol === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground",
                    col.numeric && "text-right",
                    active && "text-foreground",
                  )}
                  onClick={() => handleSort(col.key)}
                  aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {active && (sortDir === "asc"
                      ? <ArrowUp className="w-3 h-3" />
                      : <ArrowDown className="w-3 h-3" />
                    )}
                  </span>
                </th>
              );
            })}
            <th
              scope="col"
              className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-left"
            >
              Top Reason
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.source} className="border-b border-border/40 hover:bg-accent/20">
              <td className="px-3 py-2 font-medium">{row.source}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.jobs}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.avgMatch === null ? <span className="text-muted-foreground/50">—</span> : row.avgMatch}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{row.appliedPct}%</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.callbackPct}%</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.rejectedPct}%</td>
              <td className="px-3 py-2">
                {row.topRejectionReason
                  ? <RejectionReasonChip reason={row.topRejectionReason} />
                  : <span className="text-muted-foreground/50 text-[10px]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
