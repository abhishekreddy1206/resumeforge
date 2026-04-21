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
// Integration-style orchestration test via manual mocking
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
