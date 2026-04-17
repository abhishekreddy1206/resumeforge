import test from "node:test";
import assert from "node:assert/strict";
import { computeInsightsFingerprint, matchGuideToTopic } from "@/lib/insights";

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

test("insights fingerprint is stable across profile skill changes but changes when jobs or guides change", () => {
  const jobs = [{ id: "job-1", matchedAt: new Date("2026-04-13T00:00:00.000Z") }];
  const guides = [{ id: "guide-1", slug: "raft-consensus", topic: "Raft Consensus" }];

  const base = computeInsightsFingerprint(jobs, guides);
  const changedGuides = computeInsightsFingerprint(jobs, [
    ...guides,
    { id: "guide-2", slug: "kubernetes", topic: "Kubernetes" },
  ]);
  const changedJobs = computeInsightsFingerprint(
    [
      ...jobs,
      { id: "job-2", matchedAt: new Date("2026-04-14T00:00:00.000Z") },
    ],
    guides
  );

  assert.notEqual(base, changedGuides);
  assert.notEqual(base, changedJobs);
  // Skills no longer participate in the fingerprint — recomputing with the
  // same jobs + guides must yield the same hash regardless of profile state.
  assert.equal(base, computeInsightsFingerprint(jobs, guides));
});
