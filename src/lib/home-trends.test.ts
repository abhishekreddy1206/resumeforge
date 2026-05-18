import test from "node:test";
import assert from "node:assert/strict";
import {
  computeWeekOverWeekTrendsFromData,
  type TrendsInput,
} from "@/lib/home-trends";

const NOW = new Date("2026-05-17T12:00:00Z");

function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
}

// Default empty input for tests that only care about a few fields
function input(opts: Partial<TrendsInput> = {}): TrendsInput {
  return {
    now: opts.now ?? NOW,
    appliedAtTimestamps: opts.appliedAtTimestamps ?? [],
    matchedAtTimestamps: opts.matchedAtTimestamps ?? [],
    rejectedAtTimestamps: opts.rejectedAtTimestamps ?? [],
    callbackAtTimestamps: opts.callbackAtTimestamps ?? [],
    matchScoresInCurrentWeek: opts.matchScoresInCurrentWeek ?? [],
    matchScoresInPriorWeek: opts.matchScoresInPriorWeek ?? [],
    qualityScoresInCurrentWeek: opts.qualityScoresInCurrentWeek ?? [],
    qualityScoresInPriorWeek: opts.qualityScoresInPriorWeek ?? [],
  };
}

test("computeWeekOverWeekTrendsFromData: empty input → empty array", () => {
  const out = computeWeekOverWeekTrendsFromData(input());
  assert.deepEqual(out, []);
});

test("computeWeekOverWeekTrendsFromData: counts applied in [now-7d, now) vs [now-14d, now-7d)", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({
      // Current week: 3 applications in the last 7d
      appliedAtTimestamps: [daysAgo(1), daysAgo(3), daysAgo(6)],
    }),
  );
  const applied = out.find((m) => m.metric === "Applied");
  assert.ok(applied);
  assert.equal(applied!.current, 3);
  assert.equal(applied!.prior, 0);
});

test("computeWeekOverWeekTrendsFromData: prior-week window is exclusive of last 7 days", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({
      // 2 in current 7d, 4 in prior 7d, 0 beyond
      appliedAtTimestamps: [daysAgo(1), daysAgo(6), daysAgo(8), daysAgo(9), daysAgo(11), daysAgo(13)],
    }),
  );
  const applied = out.find((m) => m.metric === "Applied")!;
  assert.equal(applied.current, 2);
  assert.equal(applied.prior, 4);
});

test("computeWeekOverWeekTrendsFromData: events older than 14 days are not counted in either window", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({
      appliedAtTimestamps: [daysAgo(20), daysAgo(30)], // both > 14d ago
    }),
  );
  const applied = out.find((m) => m.metric === "Applied");
  assert.equal(applied, undefined, "metric should be excluded entirely (no movement)");
});

test("computeWeekOverWeekTrendsFromData: pctChange handles divide-by-zero (0 prior, >0 current) → 999", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({ appliedAtTimestamps: [daysAgo(1), daysAgo(2)] }),
  );
  const applied = out.find((m) => m.metric === "Applied")!;
  assert.equal(applied.prior, 0);
  assert.equal(applied.current, 2);
  assert.equal(applied.pctChange, 999, "0→2 should sentinel-saturate at 999");
});

test("computeWeekOverWeekTrendsFromData: countChange reports current - prior", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({ appliedAtTimestamps: [daysAgo(1), daysAgo(5), daysAgo(10)] }),
  );
  const applied = out.find((m) => m.metric === "Applied")!;
  assert.equal(applied.current, 2);
  assert.equal(applied.prior, 1);
  assert.equal(applied.countChange, 1);
});

test("computeWeekOverWeekTrendsFromData: returns at most 3 movers", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({
      appliedAtTimestamps: [daysAgo(1)],
      matchedAtTimestamps: [daysAgo(2)],
      rejectedAtTimestamps: [daysAgo(3)],
      callbackAtTimestamps: [daysAgo(4)],
      matchScoresInCurrentWeek: [80],
      matchScoresInPriorWeek: [50],
      qualityScoresInCurrentWeek: [90],
      qualityScoresInPriorWeek: [70],
    }),
  );
  assert.ok(out.length <= 3);
});

test("computeWeekOverWeekTrendsFromData: sorts movers by |pctChange| desc, tie-break by |countChange|", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({
      // Applied: 1→3 = +200%
      appliedAtTimestamps: [daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(10)],
      // Matched: 1→2 = +100%
      matchedAtTimestamps: [daysAgo(1), daysAgo(2), daysAgo(10)],
      // Rejected: 1→4 = +300%
      rejectedAtTimestamps: [daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(4), daysAgo(10)],
    }),
  );
  // Top movers should lead by abs %: Rejected (+300%) > Applied (+200%) > Matched (+100%)
  assert.equal(out[0].metric, "Rejected");
  assert.equal(out[1].metric, "Applied");
  if (out[2]) assert.equal(out[2].metric, "Matched");
});

test("computeWeekOverWeekTrendsFromData: Avg Match metric averages scores across the windows", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({
      matchScoresInCurrentWeek: [80, 90],   // avg 85
      matchScoresInPriorWeek: [60, 70],     // avg 65
    }),
  );
  const m = out.find((x) => x.metric === "Avg Match");
  assert.ok(m);
  assert.equal(m!.current, 85);
  assert.equal(m!.prior, 65);
});

test("computeWeekOverWeekTrendsFromData: Avg Match is excluded when both windows are empty", () => {
  const out = computeWeekOverWeekTrendsFromData(input());
  const m = out.find((x) => x.metric === "Avg Match");
  assert.equal(m, undefined);
});

test("computeWeekOverWeekTrendsFromData: Avg Quality metric works same way", () => {
  const out = computeWeekOverWeekTrendsFromData(
    input({
      qualityScoresInCurrentWeek: [80],
      qualityScoresInPriorWeek: [70],
    }),
  );
  const m = out.find((x) => x.metric === "Avg Quality");
  assert.ok(m);
  assert.equal(m!.current, 80);
  assert.equal(m!.prior, 70);
});
