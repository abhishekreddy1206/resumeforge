"use client";

interface SkillGap {
  skill: string;
  frequency: number;
  status: "strong" | "partial" | "gap";
  profileSkill?: string;
}

const STATUS_COLORS: Record<string, { bar: string; label: string; text: string }> = {
  strong: { bar: "bg-green-500", label: "Strong", text: "text-green-500" },
  partial: { bar: "bg-amber-500", label: "Partial", text: "text-amber-500" },
  gap: { bar: "bg-red-500", label: "Gap", text: "text-red-500" },
};

export function SkillGapChart({ data }: { data: SkillGap[] }) {
  const maxFreq = Math.max(...data.map((d) => d.frequency), 1);

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-1">Skill Gap Analysis</h3>
      <p className="text-xs text-muted-foreground mb-3">Skills most requested across your jobs vs your profile</p>
      <div className="space-y-2">
        {data.map((item) => {
          const colors = STATUS_COLORS[item.status];
          const widthPct = (item.frequency / maxFreq) * 100;
          return (
            <div key={item.skill} className="flex items-center gap-2">
              <span className="text-xs w-24 truncate text-foreground" title={item.skill}>{item.skill}</span>
              <div className="flex-1 bg-muted rounded h-4 overflow-hidden">
                <div className={`${colors.bar} h-full rounded transition-all`} style={{ width: `${widthPct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground w-4 text-right">{item.frequency}</span>
              <span className={`text-xs w-12 ${colors.text}`}>{colors.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
