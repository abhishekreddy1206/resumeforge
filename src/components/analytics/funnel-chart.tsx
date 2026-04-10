"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface FunnelData {
  totalJobs: number;
  matchedJobs: number;
  optimizedJobs: number;
  appliedJobs: number;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981"];
const LABELS = ["Added", "Matched", "Optimized", "Applied"];

export function FunnelChart({ data }: { data: FunnelData }) {
  const chartData = [
    { stage: "Added", value: data.totalJobs },
    { stage: "Matched", value: data.matchedJobs },
    { stage: "Optimized", value: data.optimizedJobs },
    { stage: "Applied", value: data.appliedJobs },
  ];

  const rates = [
    null,
    data.totalJobs > 0 ? Math.round((data.matchedJobs / data.totalJobs) * 100) : 0,
    data.matchedJobs > 0 ? Math.round((data.optimizedJobs / data.matchedJobs) * 100) : 0,
    data.optimizedJobs > 0 ? Math.round((data.appliedJobs / data.optimizedJobs) * 100) : 0,
  ];

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Job Search Funnel</h3>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} layout="horizontal" barCategoryGap="20%">
          <XAxis dataKey="stage" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={LABELS[i]} fill={COLORS[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-2 text-xs text-muted-foreground px-2">
        {rates.map((rate, i) => (
          <span key={LABELS[i]}>{rate !== null ? `${rate}%` : ""}</span>
        ))}
      </div>
    </div>
  );
}
