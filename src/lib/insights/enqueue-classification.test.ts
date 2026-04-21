import test from "node:test";
import assert from "node:assert/strict";
import { chunkJobIds } from "./enqueue-classification";

// ---------------------------------------------------------------------------
// Pure-function tests for chunkJobIds (no DB / Prisma needed)
// ---------------------------------------------------------------------------

test("chunkJobIds returns empty array for empty input", () => {
  const result = chunkJobIds([], 10);
  assert.deepEqual(result, []);
});

test("chunkJobIds returns a single chunk when count <= batchSize", () => {
  const ids = ["a", "b", "c"];
  const result = chunkJobIds(ids, 10);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], ids);
});

test("chunkJobIds splits evenly into exact batches", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `job-${i}`);
  const result = chunkJobIds(ids, 10);
  assert.equal(result.length, 2);
  assert.equal(result[0].length, 10);
  assert.equal(result[1].length, 10);
  assert.deepEqual(result[0], ids.slice(0, 10));
  assert.deepEqual(result[1], ids.slice(10, 20));
});

test("chunkJobIds produces 3 chunks (10+10+5) for 25 ids with batchSize=10", () => {
  const ids = Array.from({ length: 25 }, (_, i) => `job-${i}`);
  const result = chunkJobIds(ids, 10);
  assert.equal(result.length, 3);
  assert.equal(result[0].length, 10);
  assert.equal(result[1].length, 10);
  assert.equal(result[2].length, 5);
  // verify each chunk contains the right IDs
  assert.deepEqual(result[0], ids.slice(0, 10));
  assert.deepEqual(result[1], ids.slice(10, 20));
  assert.deepEqual(result[2], ids.slice(20, 25));
});

test("chunkJobIds with batchSize=1 creates one chunk per ID", () => {
  const ids = ["x", "y", "z"];
  const result = chunkJobIds(ids, 1);
  assert.equal(result.length, 3);
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(result[i], [ids[i]]);
  }
});

test("chunkJobIds preserves ID values across all chunks", () => {
  const ids = Array.from({ length: 7 }, (_, i) => `id-${i}`);
  const result = chunkJobIds(ids, 3);
  // Should be [3, 3, 1]
  assert.equal(result.length, 3);
  const flattened = result.flat();
  assert.deepEqual(flattened, ids);
});

// ---------------------------------------------------------------------------
// Orchestration tests via dependency injection (no DB / Prisma needed)
// ---------------------------------------------------------------------------

test("enqueueJobClassifications returns early when jobIds is empty", async () => {
  // Import after the pure-function tests so the module is loaded.
  // We test the exported function using a monkey-patch approach to avoid
  // needing a real Prisma connection. Since Node module cache is shared,
  // we verify the early-return path by calling with [] and confirming no
  // error is thrown (the function short-circuits before any DB access).
  const { enqueueJobClassifications } = await import("./enqueue-classification");

  // With an empty array the function must return without touching the DB.
  // If it reaches the DB call it will throw (no DB in test env) — so
  // a clean return proves the guard is working.
  await assert.doesNotReject(async () => {
    await enqueueJobClassifications([]);
  });
});

test("enqueueJobClassifications returns early when no profile exists", async () => {
  const { enqueueJobClassifications } = await import("./enqueue-classification");

  const enqueueCalls: unknown[] = [];

  await enqueueJobClassifications(["job-1"], {
    findProfile: async () => null,
    enqueue: async (...args) => {
      enqueueCalls.push(args);
    },
  });

  assert.equal(enqueueCalls.length, 0, "enqueue must not be called when profile is null");
});

test("enqueueJobClassifications passes correct payload and options to enqueue", async () => {
  const { enqueueJobClassifications } = await import("./enqueue-classification");

  type EnqueueCall = {
    type: string;
    payload: { jobIds: string[]; profileId: string };
    options: { priority: number; entityType: string; entityId: string; groupKey: string };
  };
  const enqueueCalls: EnqueueCall[] = [];

  const profileId = "profile-abc";
  const jobIds = ["job-1", "job-2", "job-3"];

  // Default batch size is 10, so all 3 ids go in one chunk
  await enqueueJobClassifications(jobIds, {
    findProfile: async () => ({ id: profileId, insightsSettings: null }),
    enqueue: async (type, payload, options) => {
      enqueueCalls.push({ type, payload, options });
    },
  });

  assert.equal(enqueueCalls.length, 1, "should produce exactly one enqueue call");
  const call = enqueueCalls[0];
  assert.equal(call.type, "classify-jobs-batch");
  assert.deepEqual(call.payload, { jobIds, profileId });
  assert.equal(call.options.priority, 5);
  assert.equal(call.options.entityType, "Profile");
  assert.equal(call.options.entityId, profileId);
  assert.equal(call.options.groupKey, `classify:${profileId}`);
});

test("enqueueJobClassifications respects custom classificationBatchSize from insightsSettings", async () => {
  const { enqueueJobClassifications } = await import("./enqueue-classification");

  const enqueueCalls: { jobIds: string[] }[] = [];
  const profileId = "profile-xyz";

  // 12 job IDs with batchSize=5 → 3 chunks: [5, 5, 2]
  const jobIds = Array.from({ length: 12 }, (_, i) => `job-${i}`);
  const insightsSettings = JSON.stringify({ classificationBatchSize: 5 });

  await enqueueJobClassifications(jobIds, {
    findProfile: async () => ({ id: profileId, insightsSettings }),
    enqueue: async (_type, payload) => {
      enqueueCalls.push({ jobIds: payload.jobIds });
    },
  });

  assert.equal(enqueueCalls.length, 3, "should produce 3 enqueue calls for 12 ids at batchSize=5");
  assert.equal(enqueueCalls[0].jobIds.length, 5);
  assert.equal(enqueueCalls[1].jobIds.length, 5);
  assert.equal(enqueueCalls[2].jobIds.length, 2);
  assert.deepEqual(enqueueCalls[0].jobIds, jobIds.slice(0, 5));
  assert.deepEqual(enqueueCalls[1].jobIds, jobIds.slice(5, 10));
  assert.deepEqual(enqueueCalls[2].jobIds, jobIds.slice(10, 12));
});
