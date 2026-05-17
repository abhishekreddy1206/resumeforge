import test from "node:test";
import assert from "node:assert/strict";
import type { GuideContentStorage, GuideSection, SectionGenStatus } from "@/lib/claude/skills/guide-generator";
import { deriveGuideGenerationSnapshotFromColumns, deriveStatusesFromContent } from "@/lib/learn-guides";

function section(opts: {
  id: string;
  explanation?: string;
  quizzes?: number;
  scenarios?: number;
  takeaways?: number;
  codeExamples?: number;
}): GuideSection {
  return {
    id: opts.id,
    title: opts.id,
    explanation: opts.explanation ?? "",
    codeExamples: Array.from({ length: opts.codeExamples ?? 0 }, () => ({
      language: "ts",
      code: "x",
      caption: "",
    })),
    knowledgeChecks: Array.from({ length: opts.quizzes ?? 0 }, (_, i) => ({
      type: "quiz" as const,
      question: `q${i}`,
      options: ["a", "b"],
      answer: 0,
      explanation: "",
    })),
    interviewScenarios: Array.from({ length: opts.scenarios ?? 0 }, (_, i) => ({
      setup: `s${i}`,
      hints: [],
      sampleAnswer: "",
    })),
    keyTakeaways: Array.from({ length: opts.takeaways ?? 0 }, (_, i) => `takeaway ${i}`),
  };
}

function content(sections: GuideSection[]): GuideContentStorage {
  return {
    title: "t",
    overview: "o",
    estimatedMinutes: 1,
    difficulty: "beginner",
    prerequisites: [],
    sections,
    references: [],
  };
}

function snapshot(
  ids: string[],
  statuses: Record<string, SectionGenStatus>,
  persistedStatus = "generating",
) {
  return deriveGuideGenerationSnapshotFromColumns(ids, statuses, persistedStatus);
}

test("snapshot: empty section list → totalCount 0, generationState running", () => {
  const s = snapshot([], {});
  assert.equal(s.totalCount, 0);
  assert.equal(s.completedCount, 0);
  assert.equal(s.generationState, "running");
});

test("snapshot: every section completed → generationState complete", () => {
  const s = snapshot(["a", "b"], { a: "completed", b: "completed" });
  assert.equal(s.completedCount, 2);
  assert.equal(s.remainingCount, 0);
  assert.equal(s.generationState, "complete");
});

test("snapshot: core_complete is NOT counted as completed", () => {
  // Regression for the bug where guides marked "ready" had sections in
  // core_complete (no interactive content yet). Publishing requires every
  // section to be fully completed.
  const s = snapshot(["a", "b"], { a: "core_complete", b: "completed" });
  assert.equal(s.completedCount, 1);
  assert.notEqual(s.generationState, "complete");
});

test("snapshot: generating_interactive is in-flight, not completed", () => {
  const s = snapshot(["a", "b"], { a: "generating_interactive", b: "completed" });
  assert.equal(s.completedCount, 1);
  assert.notEqual(s.generationState, "complete");
});

test("snapshot: missing status entry treated as pending (not completed)", () => {
  const s = snapshot(["a", "b"], { a: "completed" });
  assert.equal(s.completedCount, 1);
  assert.notEqual(s.generationState, "complete");
});

test("snapshot: failed sections surface in failedSectionIds", () => {
  const s = snapshot(["a", "b", "c"], {
    a: "completed",
    b: "failed",
    c: "failed",
  });
  assert.deepEqual(s.failedSectionIds.sort(), ["b", "c"]);
  assert.equal(s.completedCount, 1);
});

test("snapshot: blocked when failures and no in-flight work", () => {
  const s = snapshot(["a", "b"], { a: "completed", b: "failed" });
  assert.equal(s.generationState, "blocked");
});

test("snapshot: failed + still-generating remains running, not blocked", () => {
  const s = snapshot(["a", "b", "c"], {
    a: "completed",
    b: "failed",
    c: "generating",
  });
  assert.equal(s.generationState, "running");
});

test("snapshot: persistedStatus=published with all completed → complete", () => {
  const s = snapshot(["a"], { a: "completed" }, "published");
  assert.equal(s.generationState, "complete");
});

test("snapshot: persistedStatus=published BUT a section is core_complete → NOT complete", () => {
  // The published status was applied incorrectly upstream; the snapshot
  // must reveal the truth so downstream reconcilers can self-heal.
  const s = snapshot(["a", "b"], { a: "completed", b: "core_complete" }, "published");
  assert.notEqual(s.generationState, "complete");
});

test("snapshot: persistedStatus=failed → blocked even without per-section failures", () => {
  const s = snapshot(["a"], { a: "pending" }, "failed");
  assert.equal(s.generationState, "blocked");
});

test("snapshot: refining counts as in-flight, not completed", () => {
  const s = snapshot(["a", "b"], { a: "refining", b: "completed" });
  assert.equal(s.completedCount, 1);
  assert.notEqual(s.generationState, "complete");
});

// ---------------------------------------------------------------------------
// deriveStatusesFromContent — content-inspection fallback for legacy guides
// whose tracking columns were never populated.
// ---------------------------------------------------------------------------

test("deriveStatusesFromContent: empty sections → empty object", () => {
  const out = deriveStatusesFromContent(content([]));
  assert.deepEqual(out, {});
});

test("deriveStatusesFromContent: fully populated section (expl + quiz + scenario + takeaway) → completed", () => {
  const out = deriveStatusesFromContent(
    content([section({ id: "a", explanation: "real content here", quizzes: 2, scenarios: 1, takeaways: 3 })]),
  );
  assert.deepEqual(out, { a: "completed" });
});

test("deriveStatusesFromContent: explanation only (no interactives) → core_complete", () => {
  const out = deriveStatusesFromContent(
    content([section({ id: "a", explanation: "core text only" })]),
  );
  assert.deepEqual(out, { a: "core_complete" });
});

test("deriveStatusesFromContent: explanation + quizzes but no scenarios → core_complete", () => {
  const out = deriveStatusesFromContent(
    content([section({ id: "a", explanation: "x", quizzes: 1, takeaways: 1 })]),
  );
  assert.deepEqual(out, { a: "core_complete" });
});

test("deriveStatusesFromContent: empty explanation → pending", () => {
  const out = deriveStatusesFromContent(
    content([section({ id: "a", explanation: "" })]),
  );
  assert.deepEqual(out, { a: "pending" });
});

test("deriveStatusesFromContent: whitespace-only explanation → pending", () => {
  const out = deriveStatusesFromContent(
    content([section({ id: "a", explanation: "   \n  \t  " })]),
  );
  assert.deepEqual(out, { a: "pending" });
});

test("deriveStatusesFromContent: pods-style mix (2 fully done, 1 partial) → 2 completed + 1 core_complete", () => {
  const out = deriveStatusesFromContent(
    content([
      section({ id: "what-is-a-pod", explanation: "x".repeat(2000), codeExamples: 3, quizzes: 3, scenarios: 1, takeaways: 4 }),
      section({ id: "pod-lifecycle", explanation: "x".repeat(2700), codeExamples: 2, quizzes: 3, scenarios: 1, takeaways: 4 }),
      section({ id: "deployments-desired-state", explanation: "x".repeat(478) }),
    ]),
  );
  assert.deepEqual(out, {
    "what-is-a-pod": "completed",
    "pod-lifecycle": "completed",
    "deployments-desired-state": "core_complete",
  });
});

test("deriveStatusesFromContent: agentic-style (explanations present but all interactives missing) → all core_complete", () => {
  const out = deriveStatusesFromContent(
    content([
      section({ id: "a", explanation: "real" }),
      section({ id: "b", explanation: "real" }),
      section({ id: "c", explanation: "" }),
    ]),
  );
  assert.deepEqual(out, { a: "core_complete", b: "core_complete", c: "pending" });
});
