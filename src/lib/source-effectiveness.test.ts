import test from "node:test";
import assert from "node:assert/strict";
import { computeSourceEffectivenessFromJobs, type SourceJobInput } from "@/lib/source-effectiveness";

// Helper to build a job in fewer characters per test
function job(opts: Partial<SourceJobInput> & { source: string | null }): SourceJobInput {
  return {
    source: opts.source,
    applied: opts.applied ?? false,
    callbackReceived: opts.callbackReceived ?? false,
    rejected: opts.rejected ?? false,
    rejectionReason: opts.rejectionReason ?? null,
    matchResult: opts.matchResult ?? null,
  };
}

test("computeSourceEffectivenessFromJobs: empty list → empty array", () => {
  assert.deepEqual(computeSourceEffectivenessFromJobs([]), []);
});

test("computeSourceEffectivenessFromJobs: single source, all applied → 100% appliedPct", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "manual", applied: true }),
    job({ source: "manual", applied: true }),
    job({ source: "manual", applied: true }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "manual");
  assert.equal(rows[0].jobs, 3);
  assert.equal(rows[0].appliedPct, 100);
});

test("computeSourceEffectivenessFromJobs: null/empty source normalized to 'manual'", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: null }),
    job({ source: "" }),
    job({ source: "   " }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "manual");
  assert.equal(rows[0].jobs, 3);
});

test("computeSourceEffectivenessFromJobs: small source (<3 jobs) collapses into 'Other'", () => {
  const rows = computeSourceEffectivenessFromJobs([
    // 5 jobs from a real source
    ...Array.from({ length: 5 }, () => job({ source: "extension" })),
    // 2 jobs from a noise source (under threshold)
    job({ source: "rare-source" }),
    job({ source: "rare-source" }),
  ]);
  assert.equal(rows.length, 2);
  // extension row remains as itself
  assert.equal(rows[0].source, "extension");
  assert.equal(rows[0].jobs, 5);
  // small sources collapsed
  const other = rows.find((r) => r.source === "Other");
  assert.ok(other, "expected an 'Other' row");
  assert.equal(other!.jobs, 2);
});

test("computeSourceEffectivenessFromJobs: Other row appended at the bottom", () => {
  const rows = computeSourceEffectivenessFromJobs([
    ...Array.from({ length: 5 }, () => job({ source: "extension" })),
    job({ source: "rare" }),
    job({ source: "rare" }),
  ]);
  // Last row should be Other
  assert.equal(rows[rows.length - 1].source, "Other");
});

test("computeSourceEffectivenessFromJobs: default sort is jobs desc", () => {
  const rows = computeSourceEffectivenessFromJobs([
    ...Array.from({ length: 3 }, () => job({ source: "small-source" })),
    ...Array.from({ length: 10 }, () => job({ source: "big-source" })),
    ...Array.from({ length: 5 }, () => job({ source: "mid-source" })),
  ]);
  assert.equal(rows[0].source, "big-source");
  assert.equal(rows[1].source, "mid-source");
  assert.equal(rows[2].source, "small-source");
});

test("computeSourceEffectivenessFromJobs: callbackPct uses applied as denominator", () => {
  const rows = computeSourceEffectivenessFromJobs([
    // 10 jobs, 5 applied, 2 of those got callbacks
    job({ source: "extension", applied: true, callbackReceived: true }),
    job({ source: "extension", applied: true, callbackReceived: true }),
    job({ source: "extension", applied: true }),
    job({ source: "extension", applied: true }),
    job({ source: "extension", applied: true }),
    job({ source: "extension" }),
    job({ source: "extension" }),
    job({ source: "extension" }),
    job({ source: "extension" }),
    job({ source: "extension" }),
  ]);
  assert.equal(rows[0].jobs, 10);
  assert.equal(rows[0].appliedPct, 50);  // 5 of 10
  assert.equal(rows[0].callbackPct, 40); // 2 of 5 applied
});

test("computeSourceEffectivenessFromJobs: rejectedPct uses applied as denominator (not total jobs)", () => {
  const rows = computeSourceEffectivenessFromJobs([
    // 10 jobs, 4 applied, 1 rejected
    ...Array.from({ length: 4 }, () => job({ source: "extension", applied: true })),
    ...Array.from({ length: 6 }, () => job({ source: "extension" })),
    // Now reject one of the applied
  ].map((j, i) => (i === 0 ? { ...j, rejected: true } : j)));
  assert.equal(rows[0].jobs, 10);
  assert.equal(rows[0].appliedPct, 40);
  assert.equal(rows[0].rejectedPct, 25); // 1 of 4 applied
});

test("computeSourceEffectivenessFromJobs: callbackPct and rejectedPct are 0 when no applied jobs", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "extension" }),
    job({ source: "extension" }),
    job({ source: "extension" }),
  ]);
  assert.equal(rows[0].appliedPct, 0);
  assert.equal(rows[0].callbackPct, 0);
  assert.equal(rows[0].rejectedPct, 0);
});

test("computeSourceEffectivenessFromJobs: avgMatch averages matchResult.overallScore across scored jobs", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "extension", matchResult: JSON.stringify({ overallScore: 80 }) }),
    job({ source: "extension", matchResult: JSON.stringify({ overallScore: 60 }) }),
    job({ source: "extension", matchResult: null }),
  ]);
  assert.equal(rows[0].avgMatch, 70); // average of 80 and 60; the null is skipped
});

test("computeSourceEffectivenessFromJobs: avgMatch is null when no jobs have matchResult", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "extension" }),
    job({ source: "extension" }),
    job({ source: "extension" }),
  ]);
  assert.equal(rows[0].avgMatch, null);
});

test("computeSourceEffectivenessFromJobs: malformed matchResult JSON is skipped (doesn't crash)", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "extension", matchResult: "this is not json{{" }),
    job({ source: "extension", matchResult: JSON.stringify({ overallScore: 90 }) }),
    job({ source: "extension", matchResult: JSON.stringify({ overallScore: 70 }) }),
  ]);
  assert.equal(rows[0].avgMatch, 80); // malformed skipped, average of 90 and 70
});

test("computeSourceEffectivenessFromJobs: avgMatch reads .score as fallback when overallScore is missing", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "extension", matchResult: JSON.stringify({ score: 75 }) }),
    job({ source: "extension", matchResult: JSON.stringify({ score: 85 }) }),
    job({ source: "extension", matchResult: JSON.stringify({ score: 65 }) }),
  ]);
  assert.equal(rows[0].avgMatch, 75); // average of 75, 85, 65
});

test("computeSourceEffectivenessFromJobs: topRejectionReason set when bucket has >=3 rejections with same reason", () => {
  const rows = computeSourceEffectivenessFromJobs([
    ...Array.from({ length: 5 }, () =>
      job({ source: "extension", applied: true, rejected: true, rejectionReason: "salary_mismatch" })
    ),
    job({ source: "extension", applied: true, rejected: true, rejectionReason: "ghosted" }),
    job({ source: "extension", applied: true }),
  ]);
  assert.equal(rows[0].topRejectionReason, "salary_mismatch");
});

test("computeSourceEffectivenessFromJobs: topRejectionReason is null when bucket has <3 rejections", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "extension", applied: true, rejected: true, rejectionReason: "salary_mismatch" }),
    job({ source: "extension", applied: true, rejected: true, rejectionReason: "salary_mismatch" }),
    job({ source: "extension", applied: true }),
  ]);
  assert.equal(rows[0].topRejectionReason, null);
});

test("computeSourceEffectivenessFromJobs: topRejectionReason ignores unrecorded reasons (null)", () => {
  const rows = computeSourceEffectivenessFromJobs([
    job({ source: "extension", applied: true, rejected: true, rejectionReason: null }),
    job({ source: "extension", applied: true, rejected: true, rejectionReason: null }),
    job({ source: "extension", applied: true, rejected: true, rejectionReason: "ghosted" }),
    job({ source: "extension", applied: true, rejected: true, rejectionReason: "ghosted" }),
    job({ source: "extension", applied: true, rejected: true, rejectionReason: "ghosted" }),
  ]);
  // 3 rejections with reason set ("ghosted" 3x), 2 with null reason — null doesn't compete
  assert.equal(rows[0].topRejectionReason, "ghosted");
});
