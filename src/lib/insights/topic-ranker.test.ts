import test from "node:test";
import assert from "node:assert/strict";
import { rankTopicsForClusters } from "./topic-ranker";

const fakeClusters = [
  { id: "ai-engineering", jobs: new Array(10).fill(0).map((_, i) => ({ id: `j${i}` })) },
  { id: "backend-product", jobs: new Array(3).fill(0).map((_, i) => ({ id: `b${i}` })) },
];

test("ranker surfaces topics when skillKeywords overlap user gaps", () => {
  // Use a small cluster (2 jobs) so alwaysRelevant cannot fire (minJobs default=3).
  // Pick a non-alwaysRelevant topic (ai-agent-orchestration) whose skillKeywords
  // match the provided gap set to prove gap-overlap is the sole driver.
  const smallCluster = [
    { id: "ai-engineering", jobs: new Array(2).fill(0).map((_, i) => ({ id: `j${i}` })) },
  ];
  const topics = rankTopicsForClusters(smallCluster, new Set(["langgraph", "autogen"]), {
    topicsPerCluster: 5,
    totalLimit: 12,
    alwaysRelevantMinJobs: 3, // cluster has 2 → alwaysRelevant cannot fire
  });
  const agent = topics.find((t) => t.topic.id === "ai-agent-orchestration");
  assert.ok(agent, "expected agent-orchestration topic to surface via gap overlap alone");
  assert.deepEqual(agent.matchedGaps.sort(), ["autogen", "langgraph"]);
});

test("ranker surfaces alwaysRelevant topics only when cluster has ≥ alwaysRelevantMinJobs", () => {
  const mixedClusters = [
    { id: "backend-product", jobs: new Array(2).fill(0).map((_, i) => ({ id: `bp${i}` })) },
    { id: "ai-engineering", jobs: new Array(3).fill(0).map((_, i) => ({ id: `ai${i}` })) },
  ];
  const topics = rankTopicsForClusters(mixedClusters, new Set(), {
    topicsPerCluster: 5,
    totalLimit: 12,
    alwaysRelevantMinJobs: 3,
  });
  // ai-engineering has 3 jobs → alwaysRelevant topics should surface.
  assert.ok(topics.find((t) => t.clusterId === "ai-engineering" && t.topic.alwaysRelevant));
  // backend-product has 2 jobs → no topics should surface (no gaps, no alwaysRelevant hits).
  assert.equal(topics.filter((t) => t.clusterId === "backend-product").length, 0);
});

test("ranker caps topics per cluster and total", () => {
  const topics = rankTopicsForClusters(fakeClusters, new Set(), {
    topicsPerCluster: 2,
    totalLimit: 3,
  });
  assert.ok(topics.length <= 3);
  const byCluster = topics.reduce<Record<string, number>>((acc, t) => {
    acc[t.clusterId] = (acc[t.clusterId] || 0) + 1;
    return acc;
  }, {});
  for (const count of Object.values(byCluster)) {
    assert.ok(count <= 2);
  }
});

test("ranker is deterministic under different input cluster orders", () => {
  const clustersAB = [...fakeClusters];
  const clustersBA = [...fakeClusters].reverse();
  const a = rankTopicsForClusters(clustersAB, new Set(["rag"]), { topicsPerCluster: 3, totalLimit: 12 });
  const b = rankTopicsForClusters(clustersBA, new Set(["rag"]), { topicsPerCluster: 3, totalLimit: 12 });
  assert.deepEqual(
    a.map((t) => `${t.clusterId}:${t.topic.id}`).sort(),
    b.map((t) => `${t.clusterId}:${t.topic.id}`).sort()
  );
});

test("ranker downranks topics already covered by an existing guide", () => {
  // Two clusters with slightly different job counts so that without penalty,
  // ai-rag-advanced (alwaysRelevant, ai-engineering, 5 jobs) scores 7 and ranks above
  // ml-finetuning-modern (alwaysRelevant, ml-engineering, 4 jobs) which scores 6.
  // With penalty on ai-rag-advanced, its score drops to 4, below ml-finetuning at 6.
  const clusters = [
    { id: "ai-engineering", jobs: new Array(5).fill(0).map((_, i) => ({ id: `j${i}` })) },
    { id: "ml-engineering", jobs: new Array(4).fill(0).map((_, i) => ({ id: `m${i}` })) },
  ];
  const withoutPenalty = rankTopicsForClusters(clusters, new Set(), {
    topicsPerCluster: 10,
    totalLimit: 20,
  });
  const withPenalty = rankTopicsForClusters(clusters, new Set(), {
    topicsPerCluster: 10,
    totalLimit: 20,
    coveredByGuideIds: new Set(["ai-rag-advanced"]),
  });
  const rank = (arr: typeof withoutPenalty, id: string) =>
    arr.findIndex((t) => t.topic.id === id);
  // ai-rag-advanced should drop in rank (or disappear) under guidedPenalty.
  assert.ok(
    rank(withPenalty, "ai-rag-advanced") > rank(withoutPenalty, "ai-rag-advanced") ||
      rank(withPenalty, "ai-rag-advanced") === -1,
    "guidedPenalty should lower the rank of covered topics"
  );
});
