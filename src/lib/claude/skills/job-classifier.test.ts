import test from "node:test";
import assert from "node:assert/strict";
import { buildClassifierPrompt, coerceClassifierOutput } from "./job-classifier";

test("buildClassifierPrompt includes taxonomy IDs in the prefix", () => {
  const prompt = buildClassifierPrompt([
    {
      id: "job-1",
      title: "Senior AI Engineer",
      skills: ["Python", "LangChain", "RAG"],
      seniority: "senior",
      excerpt: "Build agentic systems on top of Claude.",
    },
  ]);
  assert.ok(prompt.includes("ai-engineering"));
  assert.ok(prompt.includes("platform-engineering"));
  assert.ok(prompt.includes("job-1"));
  assert.ok(prompt.includes("Return ONLY valid JSON"));
});

test("coerceClassifierOutput enforces shape and defaults on bad inputs", () => {
  const result = coerceClassifierOutput(
    [
      { jobId: "job-1", categoryId: "ai-engineering", confidence: 90 },
      { jobId: "job-2", categoryId: "totally-fake-cat", confidence: 80 },
      { jobId: "job-3", categoryId: "backend-product", confidence: 200 },
      { jobId: "job-4" },
      "not an object",
    ] as unknown[],
    ["job-1", "job-2", "job-3", "job-4"]
  );
  const byId = new Map(result.map((r) => [r.jobId, r]));
  assert.equal(byId.get("job-1")?.categoryId, "ai-engineering");
  assert.equal(byId.get("job-2")?.categoryId, "other"); // unknown cat falls to other
  assert.equal(byId.get("job-3")?.confidence, 100); // clamped
  assert.equal(byId.get("job-4")?.categoryId, "other"); // missing fields
});

test("coerceClassifierOutput includes unclaimed jobs as 'other' with 0 confidence", () => {
  const result = coerceClassifierOutput(
    [{ jobId: "job-1", categoryId: "ai-engineering", confidence: 90 }],
    ["job-1", "job-2"]
  );
  assert.equal(result.length, 2);
  const job2 = result.find((r) => r.jobId === "job-2");
  assert.equal(job2?.categoryId, "other");
  assert.equal(job2?.confidence, 0);
});
