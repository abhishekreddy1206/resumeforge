import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Orchestration tests via dependency injection (no DB / Prisma needed)
// ---------------------------------------------------------------------------

test("enqueueJobClassifications returns early when jobIds is empty", async () => {
  const { enqueueJobClassifications } = await import("./enqueue-classification");

  // Empty array short-circuits before any DB access; a clean return proves the guard.
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
