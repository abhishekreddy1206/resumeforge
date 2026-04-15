import test from "node:test";
import assert from "node:assert/strict";
import {
  getMatchScore,
  isPlaceholderJob,
  summarizeJobsBySource,
  summarizeMatchTrends,
  summarizeQualityHealth,
  summarizeResumeQualityTrends,
} from "@/lib/dashboard-analytics";

test("normalizes missing sources to manual and counts capture origins", () => {
  const summary = summarizeJobsBySource([
    { source: null },
    { source: "extension" },
    { source: "email-linkedin" },
    { source: "extension" },
  ]);

  assert.deepEqual(summary, [
    { source: "extension", count: 2 },
    { source: "email-linkedin", count: 1 },
    { source: "manual", count: 1 },
  ]);
});

test("detects placeholder jobs from analysis and scrape fallbacks", () => {
  assert.equal(
    isPlaceholderJob({
      title: "Analyzing...",
      company: "Acme",
      description: "Processing",
    }),
    true
  );

  assert.equal(
    isPlaceholderJob({
      title: "Imported from Email",
      company: "Unknown Company",
      description: "[Could not scrape — visit URL to view full description]",
    }),
    true
  );

  assert.equal(
    isPlaceholderJob({
      title: "Senior Backend Engineer",
      company: "Acme",
      description: "Build APIs",
    }),
    false
  );
});

test("match trends use job match results instead of profile version scores", () => {
  const trends = summarizeMatchTrends([
    { matchResult: JSON.stringify({ overallScore: 82 }) },
    { matchResult: JSON.stringify({ overallScore: 68 }) },
    { matchResult: null },
  ]);

  assert.equal(getMatchScore({ matchResult: JSON.stringify({ overallScore: 82 }) }), 82);
  assert.equal(trends.averageScore, 75);
  assert.equal(trends.jobCount, 2);
  assert.equal(trends.strongFitCount, 1);
});

test("resume quality trends ignore v1 versions and summarize latest v2 scores", () => {
  const trends = summarizeResumeQualityTrends([
    { jobId: "job-a", score: 70, scoreVersion: 1, delta: 5 },
    { jobId: "job-a", score: 81, scoreVersion: 2, delta: null },
    { jobId: "job-a", score: 84, scoreVersion: 2, delta: 3 },
    { jobId: "job-b", score: 79, scoreVersion: 2, delta: null },
  ]);

  assert.equal(trends.averageQuality, 82);
  assert.equal(trends.averageDelta, 3);
  assert.equal(trends.jobCount, 2);
});

test("quality health summarizes persisted v2 evaluation outcomes", () => {
  const health = summarizeQualityHealth(
    [
      {
        evaluation: JSON.stringify({
          overallScore: 84,
          hardBlockers: [],
          warnings: [{ code: "page_budget_overflow" }],
        }),
        evaluationStatus: "done",
        evaluationVersion: 2,
        roleArchetype: "backend-engineer",
        jobId: "job-a",
      },
      {
        evaluation: JSON.stringify({
          overallScore: 80,
          hardBlockers: [{ code: "invented_company" }],
          warnings: [],
        }),
        evaluationStatus: "done",
        evaluationVersion: 2,
        roleArchetype: "backend-engineer",
        jobId: "job-b",
      },
    ],
    4
  );

  assert.equal(health.evaluatedResumeCount, 2);
  assert.equal(health.hardGroundingViolationRate, 0.5);
  assert.equal(health.pageBudgetOverflowRate, 0.5);
  assert.equal(health.shareOfJobsWithValidV2Resumes, 0.25);
  assert.deepEqual(health.averageQualityByRoleArchetype, [
    { roleArchetype: "backend-engineer", averageQuality: 82, count: 2 },
  ]);
});
