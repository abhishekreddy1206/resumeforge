import test from "node:test";
import assert from "node:assert/strict";
import {
  BRIEFING_RULES,
  evaluateRules,
  type BriefingJob,
  type BriefingState,
} from "@/lib/briefing-rules";

// --- Test helpers ------------------------------------------------------------

const NOW = new Date("2026-05-17T12:00:00Z");

function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
}

function jb(opts: Partial<BriefingJob> & { id?: string } = {}): BriefingJob {
  return {
    id: opts.id ?? `j${Math.random().toString(36).slice(2, 8)}`,
    applied: opts.applied ?? false,
    appliedAt: opts.appliedAt ?? null,
    callbackReceived: opts.callbackReceived ?? false,
    callbackAt: opts.callbackAt ?? null,
    rejected: opts.rejected ?? false,
    rejectedAt: opts.rejectedAt ?? null,
    matchScore: opts.matchScore ?? null,
    matchedAt: opts.matchedAt ?? null,
    createdAt: opts.createdAt ?? daysAgo(10),
    archived: opts.archived ?? false,
  };
}

function state(opts: Partial<BriefingState> = {}): BriefingState {
  return {
    jobs: opts.jobs ?? [],
    recentProfileVersions: opts.recentProfileVersions ?? [],
    now: opts.now ?? NOW,
  };
}

function findRule(id: string) {
  const r = BRIEFING_RULES.find((rule) => rule.id === id);
  if (!r) throw new Error(`rule not found: ${id}`);
  return r;
}

// --- Rule 1: unapplied_high_matches -----------------------------------------

test("unapplied_high_matches: fires when ≥5 unapplied jobs have matchScore ≥75 and are not rejected", () => {
  const rule = findRule("unapplied_high_matches");
  const jobs = Array.from({ length: 5 }, (_, i) =>
    jb({ id: `j${i}`, matchScore: 80, applied: false }),
  );
  const prompt = rule.evaluate(state({ jobs }));
  assert.ok(prompt, "expected the rule to fire");
  assert.ok(prompt!.text.includes("5"));
  assert.equal(prompt!.priority, 1);
});

test("unapplied_high_matches: does NOT fire with 4 candidate jobs", () => {
  const rule = findRule("unapplied_high_matches");
  const jobs = Array.from({ length: 4 }, (_, i) =>
    jb({ id: `j${i}`, matchScore: 80, applied: false }),
  );
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("unapplied_high_matches: excludes rejected jobs from the count", () => {
  const rule = findRule("unapplied_high_matches");
  const jobs = [
    ...Array.from({ length: 4 }, (_, i) => jb({ id: `j${i}`, matchScore: 80 })),
    jb({ id: "rj", matchScore: 80, rejected: true }), // rejected — should NOT count
  ];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("unapplied_high_matches: excludes applied jobs from the count", () => {
  const rule = findRule("unapplied_high_matches");
  const jobs = [
    ...Array.from({ length: 4 }, (_, i) => jb({ id: `j${i}`, matchScore: 80 })),
    jb({ id: "aj", matchScore: 80, applied: true }), // applied — should NOT count
  ];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("unapplied_high_matches: excludes jobs below the 75 threshold", () => {
  const rule = findRule("unapplied_high_matches");
  const jobs = [
    ...Array.from({ length: 4 }, (_, i) => jb({ id: `j${i}`, matchScore: 80 })),
    jb({ id: "lo", matchScore: 70 }), // below threshold — should NOT count
  ];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

// --- Rule 2: quality_regression ---------------------------------------------

test("quality_regression: fires when last 3 ProfileVersions show monotonic decrease ≥8 points", () => {
  const rule = findRule("quality_regression");
  const versions = [
    { score: 90, createdAt: daysAgo(20) },
    { score: 85, createdAt: daysAgo(10) },
    { score: 80, createdAt: daysAgo(5) },  // 90→80 = 10pt drop
  ];
  const prompt = rule.evaluate(state({ recentProfileVersions: versions }));
  assert.ok(prompt);
  assert.equal(prompt!.priority, 2);
});

test("quality_regression: does NOT fire on a 7-point drop (< 8)", () => {
  const rule = findRule("quality_regression");
  const versions = [
    { score: 90, createdAt: daysAgo(20) },
    { score: 88, createdAt: daysAgo(10) },
    { score: 83, createdAt: daysAgo(5) },  // 90→83 = 7pt
  ];
  assert.equal(rule.evaluate(state({ recentProfileVersions: versions })), null);
});

test("quality_regression: does NOT fire when not monotonic (improvement in middle)", () => {
  const rule = findRule("quality_regression");
  const versions = [
    { score: 90, createdAt: daysAgo(20) },
    { score: 95, createdAt: daysAgo(10) }, // went up
    { score: 80, createdAt: daysAgo(5) },
  ];
  assert.equal(rule.evaluate(state({ recentProfileVersions: versions })), null);
});

test("quality_regression: does NOT fire with fewer than 3 versions", () => {
  const rule = findRule("quality_regression");
  const versions = [
    { score: 90, createdAt: daysAgo(20) },
    { score: 80, createdAt: daysAgo(5) },
  ];
  assert.equal(rule.evaluate(state({ recentProfileVersions: versions })), null);
});

// --- Rule 3: inactivity ------------------------------------------------------

test("inactivity: fires when no applications in last 7 days AND there's a historical applied", () => {
  const rule = findRule("inactivity");
  const jobs = [
    jb({ applied: true, appliedAt: daysAgo(15) }), // historical
  ];
  const prompt = rule.evaluate(state({ jobs }));
  assert.ok(prompt);
  assert.equal(prompt!.priority, 2);
});

test("inactivity: does NOT fire when there's a recent application", () => {
  const rule = findRule("inactivity");
  const jobs = [
    jb({ applied: true, appliedAt: daysAgo(15) }),
    jb({ applied: true, appliedAt: daysAgo(3) }), // recent
  ];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("inactivity: does NOT fire when no historical applications at all", () => {
  const rule = findRule("inactivity");
  assert.equal(rule.evaluate(state({ jobs: [jb({ applied: false })] })), null);
});

// --- Rule 4: stale_callbacks -------------------------------------------------

test("stale_callbacks: fires when a callback is >14 days old and not rejected", () => {
  const rule = findRule("stale_callbacks");
  const jobs = [
    jb({ applied: true, callbackReceived: true, callbackAt: daysAgo(20) }),
  ];
  const prompt = rule.evaluate(state({ jobs }));
  assert.ok(prompt);
  assert.equal(prompt!.priority, 1);
});

test("stale_callbacks: does NOT fire when callback is <14 days old", () => {
  const rule = findRule("stale_callbacks");
  const jobs = [
    jb({ applied: true, callbackReceived: true, callbackAt: daysAgo(10) }),
  ];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("stale_callbacks: excludes rejected jobs", () => {
  const rule = findRule("stale_callbacks");
  const jobs = [
    jb({ applied: true, callbackReceived: true, callbackAt: daysAgo(20), rejected: true }),
  ];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

// --- Rule 5: bottleneck ------------------------------------------------------

test("bottleneck: fires for matched-but-unapplied jobs older than 30 days", () => {
  const rule = findRule("bottleneck");
  const jobs = [
    jb({ matchedAt: daysAgo(40), applied: false }),
  ];
  const prompt = rule.evaluate(state({ jobs }));
  assert.ok(prompt);
  assert.equal(prompt!.priority, 3);
});

test("bottleneck: does NOT fire for matched jobs <30 days old", () => {
  const rule = findRule("bottleneck");
  const jobs = [jb({ matchedAt: daysAgo(20), applied: false })];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("bottleneck: excludes applied jobs", () => {
  const rule = findRule("bottleneck");
  const jobs = [jb({ matchedAt: daysAgo(40), applied: true })];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("bottleneck: excludes rejected jobs", () => {
  const rule = findRule("bottleneck");
  const jobs = [jb({ matchedAt: daysAgo(40), applied: false, rejected: true })];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

// --- Rule 6: unscored_jobs ---------------------------------------------------

test("unscored_jobs: fires when ≥10 jobs have no matchResult and aren't rejected", () => {
  const rule = findRule("unscored_jobs");
  const jobs = Array.from({ length: 10 }, (_, i) =>
    jb({ id: `j${i}`, matchScore: null }),
  );
  const prompt = rule.evaluate(state({ jobs }));
  assert.ok(prompt);
  assert.equal(prompt!.priority, 3);
});

test("unscored_jobs: does NOT fire with 9 unscored jobs", () => {
  const rule = findRule("unscored_jobs");
  const jobs = Array.from({ length: 9 }, (_, i) => jb({ id: `j${i}`, matchScore: null }));
  assert.equal(rule.evaluate(state({ jobs })), null);
});

test("unscored_jobs: excludes rejected jobs from the count", () => {
  const rule = findRule("unscored_jobs");
  const jobs = [
    ...Array.from({ length: 9 }, (_, i) => jb({ id: `j${i}`, matchScore: null })),
    jb({ id: "rj", matchScore: null, rejected: true }),
  ];
  assert.equal(rule.evaluate(state({ jobs })), null);
});

// --- evaluateRules orchestration --------------------------------------------

test("evaluateRules: returns prompts sorted by priority ascending", () => {
  // Build a state that triggers stale_callbacks (priority 1) AND bottleneck (priority 3)
  const jobs = [
    jb({ applied: true, callbackReceived: true, callbackAt: daysAgo(20) }),
    jb({ matchedAt: daysAgo(40), applied: false }),
  ];
  const prompts = evaluateRules(state({ jobs }));
  assert.ok(prompts.length >= 2);
  // Priority 1 should come before priority 3
  for (let i = 1; i < prompts.length; i++) {
    assert.ok(prompts[i - 1].priority <= prompts[i].priority);
  }
});

test("evaluateRules: caps at top 3 prompts", () => {
  // Trigger many rules at once
  const jobs = [
    ...Array.from({ length: 5 }, (_, i) => jb({ id: `m${i}`, matchScore: 80 })),  // unapplied_high_matches
    jb({ applied: true, callbackReceived: true, callbackAt: daysAgo(20) }),        // stale_callbacks
    jb({ matchedAt: daysAgo(40), applied: false }),                                // bottleneck
    jb({ applied: true, appliedAt: daysAgo(15) }),                                 // inactivity
    ...Array.from({ length: 10 }, (_, i) => jb({ id: `u${i}` })),                  // unscored_jobs
  ];
  const versions = [
    { score: 90, createdAt: daysAgo(20) },
    { score: 85, createdAt: daysAgo(10) },
    { score: 80, createdAt: daysAgo(5) },                                          // quality_regression
  ];
  const prompts = evaluateRules(state({ jobs, recentProfileVersions: versions }));
  assert.ok(prompts.length <= 3, "evaluateRules must cap at 3");
});

test("evaluateRules: returns empty array when no rules fire (clean state)", () => {
  // No jobs that meet any rule's criteria
  const jobs = [jb({ applied: true, appliedAt: daysAgo(1) })]; // recent application
  const prompts = evaluateRules(state({ jobs }));
  assert.deepEqual(prompts, []);
});
