import assert from "node:assert/strict";
import test from "node:test";
import {
  createSourceProfileSnapshot,
  validateOptimizationPlan,
  validateResumeData,
} from "@/lib/resume-quality";
import type { JobAnalysisData, ResumeData, ResumeOptimizationPlan } from "@/lib/types";

function buildProfile() {
  return {
    name: "Taylor Doe",
    email: "taylor@example.com",
    experiences: [
      {
        id: "exp_1",
        company: "Acme",
        title: "Senior Software Engineer",
        startDate: "2023-01",
        endDate: null,
        current: true,
        bullets: JSON.stringify([
          "Built payment APIs for 5M monthly transactions",
          "Reduced p95 latency by 32%",
        ]),
        skills: JSON.stringify(["TypeScript", "Kubernetes"]),
      },
      {
        company: "Beta Labs",
        title: "Software Engineer",
        startDate: "2021-01",
        endDate: "2022-12",
        current: false,
        bullets: JSON.stringify(["Shipped customer-facing React features"]),
        skills: JSON.stringify(["React"]),
      },
    ],
    educations: [],
    projects: [
      {
        id: "proj_1",
        name: "Payments Console",
        description: "Internal ops console for billing workflows",
        url: null,
        skills: JSON.stringify(["React", "TypeScript"]),
      },
    ],
    skills: [
      { id: "skill_1", name: "TypeScript", category: "language" },
      { id: "skill_2", name: "Kubernetes", category: "tool" },
      { id: "skill_3", name: "React", category: "framework" },
    ],
    publications: [],
    certifications: [],
    recommendations: JSON.stringify([
      {
        recommenderName: "Jamie Lee",
        recommenderTitle: "Director of Engineering",
        text: "Taylor raised the engineering bar on our payments platform.",
      },
    ]),
    additionalEmails: JSON.stringify([]),
  };
}

function buildJobAnalysis(): JobAnalysisData {
  return {
    title: "Staff Backend Engineer",
    company: "Stripe",
    description: "Build backend payment infrastructure",
    skills: ["TypeScript", "Kubernetes", "Payments"],
    requirements: [],
    atsKeywords: {
      technical: ["TypeScript"],
      domain: ["Payments"],
      tools: ["Kubernetes"],
      softSkills: [],
    },
    terminologyMap: [],
    roleArchetype: "backend-engineer",
    seniority: "staff",
  };
}

test("createSourceProfileSnapshot uses DB ids when present and deterministic hashes otherwise", () => {
  const snapshot = createSourceProfileSnapshot(buildProfile());

  assert.equal(snapshot.experiences[0].sourceKey, "exp:exp_1");
  assert.match(snapshot.experiences[1].sourceKey, /^exp:[a-f0-9]{12}$/);

  const snapshotAgain = createSourceProfileSnapshot(buildProfile());
  assert.equal(snapshot.experiences[1].sourceKey, snapshotAgain.experiences[1].sourceKey);
});

test("validateOptimizationPlan blocks title mismatches and missing source keys", () => {
  const snapshot = createSourceProfileSnapshot(buildProfile());
  const plan: ResumeOptimizationPlan = {
    summaryAngle: "Payments backend engineer",
    summaryDraft: "Builder of payment systems.",
    coreCompetencies: ["TypeScript", "Payments", "Kubernetes", "APIs", "Performance"],
    skills: { languages: ["TypeScript"], frameworks: [], tools: ["Kubernetes"], databases: [], cloud: [] },
    experiences: [
      {
        sourceKey: snapshot.experiences[0].sourceKey,
        officialTitle: "Backend Wizard",
        selectedBulletIndices: [0, 1],
        rewrittenBullets: ["Built payment APIs for 5M monthly transactions"],
      },
      {
        sourceKey: "exp:missing",
        officialTitle: "Software Engineer",
        selectedBulletIndices: [0],
        rewrittenBullets: ["Shipped React features"],
      },
    ],
    projects: [],
    publications: [],
    certifications: [],
    recommendations: [],
    omissions: [],
    pageBudgetRationale: "Focus on backend relevance.",
  };

  const issues = validateOptimizationPlan(plan, snapshot);

  assert.equal(issues.filter((issue) => issue.severity === "hard").length, 2);
  assert.ok(issues.some((issue) => issue.code === "official_title_mismatch"));
  assert.ok(issues.some((issue) => issue.code === "missing_experience_source_key"));
});

test("validateResumeData flags invented entity names and unsupported skills", () => {
  const snapshot = createSourceProfileSnapshot(buildProfile());
  const plan: ResumeOptimizationPlan = {
    summaryAngle: "Payments backend engineer",
    summaryDraft: "Builder of payment systems.",
    coreCompetencies: ["TypeScript", "Payments", "Kubernetes", "APIs", "Performance"],
    skills: { languages: ["TypeScript"], frameworks: [], tools: ["Kubernetes"], databases: [], cloud: [] },
    experiences: [
      {
        sourceKey: snapshot.experiences[0].sourceKey,
        officialTitle: snapshot.experiences[0].title,
        focusClause: "Payments Platform",
        selectedBulletIndices: [0, 1],
        rewrittenBullets: [
          "Built payment APIs for 5M monthly transactions",
          "Reduced p95 latency by 32%",
        ],
      },
    ],
    projects: [{ sourceKey: snapshot.projects[0].sourceKey, selectedReason: "Relevant payments project" }],
    publications: [],
    certifications: [],
    recommendations: [{ sourceKey: snapshot.recommendations[0].sourceKey, snippet: "Raised the engineering bar." }],
    omissions: [],
    pageBudgetRationale: "Keep it to one page.",
  };

  const resumeData: ResumeData = {
    name: "Taylor Doe",
    summary: "Payments engineer. Payments engineer. Payments engineer. Payments engineer.",
    coreCompetencies: ["TypeScript", "Payments", "Kubernetes", "APIs", "Performance"],
    experiences: [
      {
        sourceKey: snapshot.experiences[0].sourceKey,
        company: "Acme",
        title: "Senior Software Engineer | Payments Platform",
        startDate: "2023-01",
        endDate: "Present",
        bullets: [
          "Built payment APIs for 5M monthly transactions",
          "Reduced p95 latency by 32%",
        ],
      },
    ],
    projects: [
      {
        sourceKey: snapshot.projects[0].sourceKey,
        name: "Imaginary Platform",
        description: "Internal tool",
      },
    ],
    skills: {
      languages: ["TypeScript"],
      tools: ["Kubernetes", "Graph Theory"],
    },
    recommendations: [
      {
        sourceKey: snapshot.recommendations[0].sourceKey,
        recommenderName: "Jamie Lee",
        text: "Taylor raised the engineering bar on our payments platform.",
      },
    ],
  };

  const issues = validateResumeData(resumeData, snapshot, plan, buildJobAnalysis());

  assert.ok(issues.some((issue) => issue.code === "invented_project_name" && issue.severity === "hard"));
  assert.ok(issues.some((issue) => issue.code === "unsupported_skill" && issue.severity === "hard"));
  assert.ok(issues.some((issue) => issue.code === "summary_budget" && issue.severity === "soft"));
});
