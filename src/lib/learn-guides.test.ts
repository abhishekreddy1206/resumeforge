import test from "node:test";
import assert from "node:assert/strict";
import type { SectionGenStatus } from "@/lib/claude/skills/guide-generator";
import { deriveGuideGenerationSnapshotFromColumns } from "@/lib/learn-guides";

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
