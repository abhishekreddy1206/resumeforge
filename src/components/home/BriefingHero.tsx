"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { FreshnessChip } from "@/components/home/FreshnessChip";
import type { Prompt } from "@/lib/briefing-rules";
import type { TrendMover } from "@/lib/home-trends";

interface BriefingResponse {
  prompts: Prompt[];
  trends: TrendMover[];
  cachedAt: string | null;
}

export function BriefingHero({ className }: { className?: string }) {
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const res = await fetch("/api/home/briefing");
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as BriefingResponse;
        if (!cancelled) {
          setData(json);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
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

  // Hide entirely when there's no signal (under-5-jobs case, or no data yet)
  if (!loaded) return null;
  if (!data || (data.prompts.length === 0 && data.trends.length === 0)) return null;

  // Max absolute pctChange across all trend movers — used to scale bar widths
  const maxAbs = data.trends.reduce((max, t) => Math.max(max, Math.abs(t.pctChange)), 0) || 1;

  return (
    <section
      className={cn(
        "border-y-[3px] border-foreground/85 py-6 mb-12 card-hover anim-fade-up",
        className,
      )}
    >
      <div className="flex items-baseline gap-3 mb-4">
        <h2
          className="text-foreground"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
            fontWeight: 400,
          }}
        >
          Briefing
        </h2>
        <FreshnessChip cachedAt={data.cachedAt} />
      </div>

      {/* Prompts */}
      {data.prompts.length > 0 && (
        <ul className="flex flex-col gap-2 mb-6">
          {data.prompts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              {p.emoji && <span className="text-base shrink-0">{p.emoji}</span>}
              <span className="flex-1">{p.text}</span>
              {p.href && (
                <a
                  href={p.href}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1 text-xs h-7 shrink-0" })}
                >
                  Review
                  <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Trends tile */}
      {data.trends.length > 0 && (
        <div className="border-t border-border pt-4">
          <p
            className="text-muted-foreground mb-3 text-[10px] font-mono uppercase tracking-wider"
          >
            Last 7 days · top movers
          </p>
          <div className="flex flex-col gap-2">
            {data.trends.map((t) => {
              const widthPct = (Math.abs(t.pctChange) / maxAbs) * 100;
              const up = t.pctChange >= 0;
              return (
                <div key={t.metric} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">{t.metric}</span>
                  <div className="flex-1 h-1.5 rounded-sm bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        up ? "bg-emerald-500/70" : "bg-red-500/70",
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className={cn(
                    "w-16 text-right tabular-nums text-xs",
                    up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                  )}>
                    {up ? "+" : ""}{t.pctChange}%
                  </span>
                  <span className="w-20 text-right tabular-nums text-[10px] text-muted-foreground">
                    ({t.prior} → {t.current})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
