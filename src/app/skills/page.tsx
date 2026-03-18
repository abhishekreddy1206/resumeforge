"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Skill {
  id: string;
  name: string;
  category: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; num: string }> = {
  language:  { label: "Languages",    num: "01" },
  framework: { label: "Frameworks",   num: "02" },
  tool:      { label: "Tools",        num: "03" },
  database:  { label: "Databases",    num: "04" },
  cloud:     { label: "Cloud & DevOps", num: "05" },
  soft:      { label: "Soft Skills",  num: "06" },
};

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

function SkillsSkeleton() {
  return (
    <div className="space-y-0">
      <div className="border-b border-border pb-10 pt-2">
        <Skeleton className="h-3 w-16 mb-8" />
        <Skeleton className="h-14 w-48 mb-2" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="flex gap-2 py-6 border-b border-border">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-24 rounded-sm" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 pt-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-border pb-8 mb-8 pr-0 sm:pr-8">
            <Skeleton className="h-3 w-24 mb-4" />
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((j) => (
                <Skeleton key={j} className="h-6 w-20 rounded-sm" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Skill[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data) => {
        setSkills(data.skills || []);
        setGrouped(data.grouped || {});
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkillsSkeleton />;

  if (skills.length === 0) {
    return (
      <div className="space-y-0">
        <div className="border-b border-border pb-10 pt-2 anim-fade-up">
          <p className="text-muted-foreground mb-6" style={monoStyle}>Skills</p>
          <h1
            className="text-foreground leading-none mb-2"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 400,
            }}
          >
            No skills yet
          </h1>
          <div className="section-divider mt-5 mb-5" />
          <p className="text-muted-foreground text-sm mb-6 max-w-sm leading-relaxed">
            Upload your resume to automatically extract and categorize your skills,
            or enrich your profile from GitHub.
          </p>
          <a href="/profile" className={buttonVariants({ className: "rounded-sm" })}>
            Upload Resume
          </a>
        </div>
      </div>
    );
  }

  const categories = Object.keys(grouped);
  const filteredGrouped =
    filter === "all" ? grouped : { [filter]: grouped[filter] || [] };

  return (
    <div className="space-y-0">
      {/* ── Header ─── */}
      <section className="border-b border-border pb-10 pt-2 anim-fade-up">
        <p className="text-muted-foreground mb-6" style={monoStyle}>
          Skills · {categories.length} categories
        </p>
        <h1
          className="text-foreground leading-none"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: "clamp(2.5rem, 6vw, 4rem)",
            fontWeight: 400,
          }}
        >
          {skills.length}{" "}
          <span className="text-primary">skills</span> tracked
        </h1>
        <div className="section-divider mt-5" />
      </section>

      {/* ── Filter Bar ─── */}
      <section className="py-5 border-b border-border flex flex-wrap gap-1.5 anim-fade-up-1">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 text-xs transition-all rounded-sm border ${
            filter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
          }`}
          style={monoStyle}
        >
          All ({skills.length})
        </button>
        {categories.map((cat) => {
          const config = CATEGORY_CONFIG[cat] || { label: cat, num: "—" };
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 transition-all rounded-sm border ${
                filter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
              style={monoStyle}
            >
              {config.label} ({grouped[cat].length})
            </button>
          );
        })}
      </section>

      {/* ── Skills Grid ─── */}
      <section className="pt-10 anim-fade-up-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-x-12">
          {Object.entries(filteredGrouped).map(([category, categorySkills]) => {
            const config = CATEGORY_CONFIG[category] || { label: category, num: "—" };
            return (
              <div key={category}>
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-primary" style={{ ...monoStyle, fontSize: "0.6rem" }}>
                    {config.num}
                  </span>
                  <p className="text-foreground" style={monoStyle}>
                    {config.label}
                  </p>
                  <span className="text-muted-foreground ml-auto" style={monoStyle}>
                    {categorySkills.length}
                  </span>
                </div>
                <div className="h-px bg-border mb-4" />
                <div className="flex flex-wrap gap-1.5">
                  {categorySkills.map((skill) => (
                    <Badge
                      key={skill.id}
                      variant="secondary"
                      className="text-xs rounded-sm hover:bg-primary/10 hover:text-primary transition-colors cursor-default"
                    >
                      {skill.name}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
