import React from "react";

export const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 500,
};

export function ProgressBar({
  value,
  label,
  color = "primary",
}: {
  value: number;
  label: string;
  color?: "primary" | "emerald" | "amber";
}) {
  const colorClass =
    color === "emerald"
      ? "bg-emerald-500"
      : color === "amber"
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        />
      </div>
      <span
        className="text-muted-foreground shrink-0"
        style={{ ...monoStyle, fontSize: "0.55rem" }}
      >
        {label}
      </span>
    </div>
  );
}
