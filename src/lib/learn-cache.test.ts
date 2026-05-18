import test from "node:test";
import assert from "node:assert/strict";
import { computeGapsFingerprint } from "@/lib/learn-cache";

const baseJob = {
  id: "j1",
  matchedAt: new Date("2026-04-01T12:00:00Z"),
  matchResult: JSON.stringify({ score: 80 }),
  terminologyMap: null,
  description: "Desc",
};

test("computeGapsFingerprint: deterministic", () => {
  assert.equal(computeGapsFingerprint([baseJob]), computeGapsFingerprint([baseJob]));
});

test("computeGapsFingerprint: changes when matchResult content changes", () => {
  const before = computeGapsFingerprint([baseJob]);
  const after = computeGapsFingerprint([
    { ...baseJob, matchResult: JSON.stringify({ score: 90 }) },
  ]);
  assert.notEqual(before, after);
});

test("computeGapsFingerprint: stable when only matchedAt changes", () => {
  const a = computeGapsFingerprint([baseJob]);
  const b = computeGapsFingerprint([
    { ...baseJob, matchedAt: new Date("2026-05-15T00:00:00Z") },
  ]);
  assert.equal(a, b);
});

test("computeGapsFingerprint: stable across job order", () => {
  const j2 = { ...baseJob, id: "j2" };
  const a = computeGapsFingerprint([baseJob, j2]);
  const b = computeGapsFingerprint([j2, baseJob]);
  assert.equal(a, b);
});

test("computeGapsFingerprint: empty list → stable non-empty hash", () => {
  const a = computeGapsFingerprint([]);
  const b = computeGapsFingerprint([]);
  assert.equal(a, b);
  assert.ok(a.length > 0);
});
