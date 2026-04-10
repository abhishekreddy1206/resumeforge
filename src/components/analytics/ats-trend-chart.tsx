"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface ATSTrends {
  averageInitialScore: number;
  averageFinalScore: number;
  averageImprovement: number;
  jobCount: number;
  distribution: Array<{ range: string; count: number }>;
}

export function ATSTrendChart({ data }: { data: ATSTrends }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-1">ATS Score Trends</h3>
      <p className="text-xs text-muted-foreground mb-3">Score distribution across optimized jobs</p>
      {data.jobCount === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No optimization data yet. Match and optimize jobs to see trends.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={data.distribution} barCategoryGap="20%">
              <XAxis dataKey="range" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value) => [`${value} jobs`, "Count"]}
              />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2 text-xs">
            <span className="text-muted-foreground">Avg initial: <span className="text-foreground font-medium">{data.averageInitialScore}</span></span>
            <span className="text-muted-foreground">Avg final: <span className="text-foreground font-medium">{data.averageFinalScore}</span></span>
            <span className="text-green-500 font-medium">+{data.averageImprovement} pts avg improvement across {data.jobCount} jobs</span>
          </div>
        </>
      )}
    </div>
  );
}
