import test from "node:test";
import assert from "node:assert/strict";
import { rankTopicsForClusters } from "./topic-ranker";

const fakeClusters = [
  { id: "ai-engineering", jobs: new Array(10).fill(0).map((_, i) => ({ id: `j${i}` })) },
  { id: "backend-product", jobs: new Array(3).fill(0).map((_, i) => ({ id: `b${i}` })) },
];

test("ranker surfaces topics when skillKeywords overlap user gaps", () => {
  const topics = rankTopicsForClusters(fakeClusters, new Set(["rag", "langchain"]), {
    topicsPerCluster: 3,
    totalLimit: 12,
  });
  const rag = topics.find((t) => t.topic.id === "ai-rag-advanced");
  assert.ok(rag, "expected RAG topic to surface via gap overlap");
});

test("ranker surfaces alwaysRelevant topics when cluster has ≥3 jobs", () => {
  const topics = rankTopicsForClusters(fakeClusters, new Set(), {
    topicsPerCluster: 3,
    totalLimit: 12,
  });
  const rag = topics.find((t) => t.topic.id === "ai-rag-advanced");
  assert.ok(rag, "alwaysRelevant topic should surface on big clusters");
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

test("ranker is deterministic given same inputs", () => {
  const a = rankTopicsForClusters(fakeClusters, new Set(["rag"]), { topicsPerCluster: 3, totalLimit: 12 });
  const b = rankTopicsForClusters(fakeClusters, new Set(["rag"]), { topicsPerCluster: 3, totalLimit: 12 });
  assert.deepEqual(
    a.map((t) => t.topic.id),
    b.map((t) => t.topic.id)
  );
});
