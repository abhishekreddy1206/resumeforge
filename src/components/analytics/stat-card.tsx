"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendColor?: string;
}

export function StatCard({ label, value, trend, trendColor = "text-muted-foreground" }: StatCardProps) {
  return (
    <div className="index-card">
      <div className="label-mono-sm text-muted-foreground">{label}</div>
      <div className="numerals text-[2.6rem] leading-none text-foreground mt-1">
        {value}
      </div>
      <div className="rule-hair mt-1.5" />
      {trend && (
        <div
          className={`${trendColor}`}
          style={{
            fontFamily: "var(--font-dm-mono)",
            fontSize: "0.6rem",
            letterSpacing: "0.06em",
            marginTop: "0.15rem",
          }}
        >
          {trend}
        </div>
      )}
    </div>
  );
}
