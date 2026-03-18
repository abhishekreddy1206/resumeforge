"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

interface Skill {
  id: string;
  name: string;
  category: string;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  language: {
    label: "Languages",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  framework: {
    label: "Frameworks",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
  },
  tool: {
    label: "Tools",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  database: {
    label: "Databases",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
  },
  cloud: {
    label: "Cloud & DevOps",
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-200",
  },
  soft: {
    label: "Soft Skills",
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
  },
};

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skills</h1>
          <p className="text-muted-foreground mt-1">
            Your technical and professional skills
          </p>
        </div>
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">No skills yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Upload your resume to automatically extract and categorize your
              skills, or enrich your profile from GitHub.
            </p>
            <a href="/profile" className={buttonVariants()}>
              Upload Resume
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const categories = Object.keys(grouped);
  const filteredGrouped =
    filter === "all"
      ? grouped
      : { [filter]: grouped[filter] || [] };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Skills</h1>
        <p className="text-muted-foreground mt-1">
          {skills.length} skills across {categories.length} categories —
          extracted from your resume, GitHub, and other sources
        </p>
      </div>

      {/* Filter Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({skills.length})
            </button>
            {categories.map((cat) => {
              const config = CATEGORY_CONFIG[cat] || {
                label: cat,
                color: "text-foreground",
                bg: "bg-muted",
              };
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {config.label} ({grouped[cat].length})
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(filteredGrouped).map(([category, categorySkills]) => {
          const config = CATEGORY_CONFIG[category] || {
            label: category,
            color: "text-foreground",
            bg: "bg-muted border-border",
          };
          return (
            <Card key={category} className={`shadow-sm border ${config.bg}`}>
              <CardHeader className="pb-3">
                <CardTitle className={`text-lg ${config.color}`}>
                  {config.label}
                </CardTitle>
                <CardDescription>
                  {categorySkills.length} skill
                  {categorySkills.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {categorySkills.map((skill) => (
                    <Badge
                      key={skill.id}
                      variant="secondary"
                      className="px-3 py-1 text-xs font-medium"
                    >
                      {skill.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
