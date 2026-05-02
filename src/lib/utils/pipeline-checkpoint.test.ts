import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCheckpointFingerprint,
  isTransientPipelineError,
  readCheckpoint,
  readValidCheckpoint,
} from "./pipeline-checkpoint";
import type { JobAnalysisData } from "@/lib/types";

const baseJobAnalysis: JobAnalysisData = {
  title: "Senior Software Engineer",
  company: "Acme",
  description: "Build APIs.",
  skills: ["TypeScript"],
  requirements: [],
  atsKeywords: { technical: [], domain: [], tools: [], softSkills: [] },
  seniority: "senior",
  roleArchetype: "backend-engineer",
  terminologyMap: [],
};

test("isTransientPipelineError flags Claude CLI subprocess failures", () => {
  assert.equal(isTransientPipelineError(new Error("Claude CLI exited with code 1: out of tokens")), true);
  assert.equal(isTransientPipelineError(new Error("Claude CLI timed out after 480000ms")), true);
  assert.equal(isTransientPipelineError(new Error("Failed to start claude CLI: ENOENT")), true);
});

test("isTransientPipelineError flags network/socket errors", () => {
  assert.equal(isTransientPipelineError(new Error("read ECONNRESET")), true);
  assert.equal(isTransientPipelineError(new Error("connect ETIMEDOUT 10.0.0.1:443")), true);
  assert.equal(isTransientPipelineError(new Error("write EPIPE")), true);
});

test("isTransientPipelineError flags token / session / rate-limit messages", () => {
  assert.equal(isTransientPipelineError(new Error("hit 5-hour usage limit")), true);
  assert.equal(isTransientPipelineError(new Error("Anthropic rate limit reached")), true);
  assert.equal(isTransientPipelineError(new Error("context window exceeded")), true);
  assert.equal(isTransientPipelineError(new Error("max tokens for this request")), true);
  assert.equal(isTransientPipelineError(new Error("session expired")), true);
});

test("isTransientPipelineError returns false for non-transient errors", () => {
  assert.equal(isTransientPipelineError(new Error("validation_failed: missing field")), false);
  assert.equal(isTransientPipelineError(new Error("Job not found")), false);
  assert.equal(isTransientPipelineError(new Error("invalid JSON in profile snapshot")), false);
  assert.equal(isTransientPipelineError(undefined), false);
  assert.equal(isTransientPipelineError(""), false);
});

test("computeCheckpointFingerprint is deterministic across calls", () => {
  const profile = { name: "Taylor", skills: ["TypeScript"] };
  const a = computeCheckpointFingerprint({
    profileSnapshot: profile,
    jobAnalysis: baseJobAnalysis,
    aiModel: "sonnet",
    qualityVersion: 2,
  });
  const b = computeCheckpointFingerprint({
    profileSnapshot: profile,
    jobAnalysis: baseJobAnalysis,
    aiModel: "sonnet",
    qualityVersion: 2,
  });
  assert.equal(a, b);
  assert.equal(a.length, 32);
});

test("computeCheckpointFingerprint changes when profile changes", () => {
  const a = computeCheckpointFingerprint({
    profileSnapshot: { name: "Taylor" },
    jobAnalysis: baseJobAnalysis,
    aiModel: "sonnet",
    qualityVersion: 2,
  });
  const b = computeCheckpointFingerprint({
    profileSnapshot: { name: "Taylor", summary: "edited" },
    jobAnalysis: baseJobAnalysis,
    aiModel: "sonnet",
    qualityVersion: 2,
  });
  assert.notEqual(a, b);
});

test("computeCheckpointFingerprint changes when AI model or quality version changes", () => {
  const profile = { name: "Taylor" };
  const base = computeCheckpointFingerprint({
    profileSnapshot: profile,
    jobAnalysis: baseJobAnalysis,
    aiModel: "sonnet",
    qualityVersion: 2,
  });
  const otherModel = computeCheckpointFingerprint({
    profileSnapshot: profile,
    jobAnalysis: baseJobAnalysis,
    aiModel: "opus",
    qualityVersion: 2,
  });
  const otherVersion = computeCheckpointFingerprint({
    profileSnapshot: profile,
    jobAnalysis: baseJobAnalysis,
    aiModel: "sonnet",
    qualityVersion: 3,
  });
  assert.notEqual(base, otherModel);
  assert.notEqual(base, otherVersion);
});

test("readCheckpoint returns null for empty / malformed input", () => {
  assert.equal(readCheckpoint(null), null);
  assert.equal(readCheckpoint(undefined), null);
  assert.equal(readCheckpoint(""), null);
  assert.equal(readCheckpoint("not-json"), null);
  assert.equal(readCheckpoint("{}"), null); // missing fingerprint + stages
  assert.equal(readCheckpoint(JSON.stringify({ fingerprint: "abc" })), null);
});

test("readCheckpoint parses well-formed checkpoint JSON", () => {
  const ck = {
    fingerprint: "abc123",
    stages: { match: { completedAt: "2026-05-01T00:00:00Z", data: { score: 80 } } },
  };
  const parsed = readCheckpoint(JSON.stringify(ck));
  assert.ok(parsed);
  assert.equal(parsed?.fingerprint, "abc123");
  assert.deepEqual(parsed?.stages.match?.data, { score: 80 });
});

test("readValidCheckpoint discards checkpoint when fingerprint mismatches", () => {
  const ck = {
    fingerprint: "old-fingerprint",
    stages: { match: { completedAt: "2026-05-01T00:00:00Z", data: { score: 80 } } },
  };
  const result = readValidCheckpoint(JSON.stringify(ck), "new-fingerprint");
  assert.equal(result, null);
});

test("readValidCheckpoint keeps checkpoint when fingerprint matches", () => {
  const ck = {
    fingerprint: "match",
    stages: {
      match: { completedAt: "2026-05-01T00:00:00Z", data: { score: 80 } },
      plan: { completedAt: "2026-05-01T00:01:00Z", data: { focus: "backend" } },
    },
  };
  const result = readValidCheckpoint(JSON.stringify(ck), "match");
  assert.ok(result);
  assert.deepEqual(result?.stages.match?.data, { score: 80 });
  assert.deepEqual(result?.stages.plan?.data, { focus: "backend" });
});
