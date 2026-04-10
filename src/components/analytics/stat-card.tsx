"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendColor?: string;
}

export function StatCard({ label, value, trend, trendColor = "text-muted-foreground" }: StatCardProps) {
  return (
    <div className="bg-card border rounded-lg p-4 text-center">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {trend && <div className={`text-xs mt-1 ${trendColor}`}>{trend}</div>}
    </div>
  );
}
