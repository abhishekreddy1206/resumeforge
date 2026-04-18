import test from "node:test";
import assert from "node:assert/strict";
import {
  computeInsightsFingerprint,
  hashProfileSkills,
  matchGuideToTopic,
} from "@/lib/insights";

test("matches guides by exact normalized topic", () => {
  const match = matchGuideToTopic("Raft Consensus", [
    { id: "g1", slug: "raft-consensus", topic: "Raft Consensus" },
    { id: "g2", slug: "kafka", topic: "Kafka Internals" },
  ]);

  assert.deepEqual(match, {
    id: "g1",
    slug: "raft-consensus",
    topic: "Raft Consensus",
  });
});

test("matches guides by unique fuzzy topic containment", () => {
  const match = matchGuideToTopic("Kubernetes Pod Networking", [
    { id: "g1", slug: "kubernetes-pod-networking-deep-dive", topic: "Kubernetes Pod Networking Deep Dive" },
    { id: "g2", slug: "raft-consensus", topic: "Raft Consensus" },
  ]);

  assert.deepEqual(match, {
    id: "g1",
    slug: "kubernetes-pod-networking-deep-dive",
    topic: "Kubernetes Pod Networking Deep Dive",
  });
});

test("does not match ambiguous fuzzy topics", () => {
  const match = matchGuideToTopic("Kubernetes", [
    { id: "g1", slug: "kubernetes-networking", topic: "Kubernetes Networking" },
    { id: "g2", slug: "kubernetes-operators", topic: "Kubernetes Operators" },
  ]);

  assert.equal(match, null);
});

test("fingerprint is deterministic for identical inputs", () => {
  const jobs = [
    {
      id: "job-1",
      matchedAt: new Date("2026-04-13T00:00:00.000Z"),
      applied: false,
      score: 72,
    },
  ];
  const guides = [{ id: "guide-1", slug: "raft", topic: "Raft Consensus" }];
  const extra = { profileSkillsHash: "sk-a", jobCount: 1 };

  assert.equal(
    computeInsightsFingerprint(jobs, guides, extra),
    computeInsightsFingerprint(jobs, guides, extra)
  );
});

test("fingerprint changes when guides change", () => {
  const jobs = [
    { id: "job-1", matchedAt: new Date("2026-04-13T00:00:00.000Z"), applied: false, score: 72 },
  ];
  const extra = { profileSkillsHash: "sk-a", jobCount: 1 };

  const base = computeInsightsFingerprint(
    jobs,
    [{ id: "g1", slug: "raft", topic: "Raft Consensus" }],
    extra
  );
  const more = computeInsightsFingerprint(
    jobs,
    [
      { id: "g1", slug: "raft", topic: "Raft Consensus" },
      { id: "g2", slug: "k8s", topic: "Kubernetes" },
    ],
    extra
  );
  assert.notEqual(base, more);
});

test("fingerprint changes when a job's applied flag flips", () => {
  const guides = [{ id: "g1", slug: "raft", topic: "Raft Consensus" }];
  const extra = { profileSkillsHash: "sk-a", jobCount: 1 };
  const matchedAt = new Date("2026-04-13T00:00:00.000Z");

  const unapplied = computeInsightsFingerprint(
    [{ id: "job-1", matchedAt, applied: false, score: 72 }],
    guides,
    extra
  );
  const applied = computeInsightsFingerprint(
    [{ id: "job-1", matchedAt, applied: true, score: 72 }],
    guides,
    extra
  );
  assert.notEqual(unapplied, applied);
});

test("fingerprint changes when a job's score changes meaningfully", () => {
  const guides = [{ id: "g1", slug: "raft", topic: "Raft Consensus" }];
  const extra = { profileSkillsHash: "sk-a", jobCount: 1 };
  const matchedAt = new Date("2026-04-13T00:00:00.000Z");

  const low = computeInsightsFingerprint(
    [{ id: "job-1", matchedAt, applied: false, score: 60 }],
    guides,
    extra
  );
  const high = computeInsightsFingerprint(
    [{ id: "job-1", matchedAt, applied: false, score: 80 }],
    guides,
    extra
  );
  assert.notEqual(low, high);
});

test("fingerprint changes when a job drops out (crosses score threshold)", () => {
  const guides = [{ id: "g1", slug: "raft", topic: "Raft Consensus" }];
  const matchedAt = new Date("2026-04-13T00:00:00.000Z");

  const withJob = computeInsightsFingerprint(
    [
      { id: "job-1", matchedAt, applied: false, score: 70 },
      { id: "job-2", matchedAt, applied: false, score: 75 },
    ],
    guides,
    { profileSkillsHash: "sk-a", jobCount: 2 }
  );
  const withoutJob = computeInsightsFingerprint(
    [{ id: "job-1", matchedAt, applied: false, score: 70 }],
    guides,
    { profileSkillsHash: "sk-a", jobCount: 2 }
  );
  assert.notEqual(withJob, withoutJob);
});

test("fingerprint changes when profile skills change", () => {
  const guides = [{ id: "g1", slug: "raft", topic: "Raft Consensus" }];
  const jobs = [
    { id: "job-1", matchedAt: new Date("2026-04-13T00:00:00.000Z"), applied: false, score: 72 },
  ];

  const a = computeInsightsFingerprint(jobs, guides, { profileSkillsHash: "sk-a", jobCount: 1 });
  const b = computeInsightsFingerprint(jobs, guides, { profileSkillsHash: "sk-b", jobCount: 1 });
  assert.notEqual(a, b);
});

test("fingerprint changes when total job count changes (e.g. deletion)", () => {
  const guides = [{ id: "g1", slug: "raft", topic: "Raft Consensus" }];
  const jobs = [
    { id: "job-1", matchedAt: new Date("2026-04-13T00:00:00.000Z"), applied: false, score: 72 },
  ];

  // Same realistic job, but total job pool shrank from 5 → 3 (deletions of
  // unrealistic jobs). Fingerprint must still change.
  const before = computeInsightsFingerprint(jobs, guides, { profileSkillsHash: "sk-a", jobCount: 5 });
  const after = computeInsightsFingerprint(jobs, guides, { profileSkillsHash: "sk-a", jobCount: 3 });
  assert.notEqual(before, after);
});

test("hashProfileSkills is stable and case/order insensitive", () => {
  const a = hashProfileSkills([{ name: "TypeScript" }, { name: "Python" }]);
  const b = hashProfileSkills([{ name: "python" }, { name: "typescript" }]);
  assert.equal(a, b);

  const c = hashProfileSkills([{ name: "TypeScript" }, { name: "Python" }, { name: "Go" }]);
  assert.notEqual(a, c);
});
