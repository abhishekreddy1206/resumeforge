import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("job-queue");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnqueueOptions {
  priority?: number;
  maxAttempts?: number;
  parentJobId?: string;
  groupKey?: string;
  entityId?: string;
  entityType?: string;
}

export interface JobRecord {
  id: string;
  type: string;
  status: string;
  payload: string;
  result: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  priority: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  parentJobId: string | null;
  groupKey: string | null;
  entityId: string | null;
  entityType: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface JobStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Finalize job types excluded from group-completion checks
// ---------------------------------------------------------------------------

const FINALIZE_JOB_TYPES = new Set(["guide-finalize", "guide-refine-finalize"]);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Create a pending background job.
 */
export async function enqueueJob(
  type: string,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<JobRecord> {
  const {
    priority = 0,
    maxAttempts = 3,
    parentJobId,
    groupKey,
    entityId,
    entityType,
  } = opts;

  const job = await prisma.backgroundJob.create({
    data: {
      type,
      status: "pending",
      payload: JSON.stringify(payload),
      priority,
      maxAttempts,
      parentJobId: parentJobId ?? null,
      groupKey: groupKey ?? null,
      entityId: entityId ?? null,
      entityType: entityType ?? null,
    },
  });

  log.info("job_enqueued", {
    jobId: job.id,
    type,
    priority,
    groupKey,
    entityId,
    entityType,
  });

  return job as JobRecord;
}

/**
 * Bulk enqueue multiple jobs in a single Prisma transaction.
 */
export async function enqueueJobs(
  jobs: Array<{ type: string; payload: Record<string, unknown>; opts?: EnqueueOptions }>,
): Promise<JobRecord[]> {
  const results = await prisma.$transaction(
    jobs.map(({ type, payload, opts = {} }) => {
      const {
        priority = 0,
        maxAttempts = 3,
        parentJobId,
        groupKey,
        entityId,
        entityType,
      } = opts;

      return prisma.backgroundJob.create({
        data: {
          type,
          status: "pending",
          payload: JSON.stringify(payload),
          priority,
          maxAttempts,
          parentJobId: parentJobId ?? null,
          groupKey: groupKey ?? null,
          entityId: entityId ?? null,
          entityType: entityType ?? null,
        },
      });
    }),
  );

  log.info("jobs_bulk_enqueued", { count: results.length });

  return results as JobRecord[];
}

/**
 * Atomically claim the next pending job for a worker.
 * Uses a $transaction to find-then-update, safe under SQLite's single-writer model.
 */
export async function dequeueJob(workerId: string): Promise<JobRecord | null> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.backgroundJob.findFirst({
      where: { status: "pending" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    if (!job) return null;

    const updated = await tx.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        lockedAt: new Date(),
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });

    log.info("job_dequeued", {
      jobId: updated.id,
      type: updated.type,
      workerId,
      attempt: updated.attempts,
    });

    return updated as JobRecord;
  });
}

/**
 * Mark a job as completed with an optional result payload.
 */
export async function completeJob(
  jobId: string,
  result?: Record<string, unknown>,
): Promise<JobRecord> {
  const job = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      result: result !== undefined ? JSON.stringify(result) : null,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });

  log.info("job_completed", { jobId, type: job.type });

  return job as JobRecord;
}

/**
 * Record a job failure. If attempts < maxAttempts, reset to pending for retry.
 * Otherwise mark as permanently failed.
 */
export async function failJob(jobId: string, error: unknown): Promise<JobRecord> {
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  // Read first to check retry eligibility.
  const existing = await prisma.backgroundJob.findUniqueOrThrow({
    where: { id: jobId },
  });

  const retryable = existing.attempts < existing.maxAttempts;

  if (retryable) {
    const job = await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "pending",
        error: errorMessage,
        lockedAt: null,
        lockedBy: null,
      },
    });

    log.warn("job_failed_retrying", {
      jobId,
      type: job.type,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error: errorMessage,
    });

    return job as JobRecord;
  }

  // Exhausted all attempts — mark permanently failed.
  const job = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      error: errorMessage,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });

  log.error("job_failed_exhausted", {
    jobId,
    type: job.type,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error: errorMessage,
  });

  return job as JobRecord;
}

/**
 * Cancel all pending jobs for a given entity.
 */
export async function cancelJobsByEntity(
  entityId: string,
  entityType: string,
): Promise<number> {
  const { count } = await prisma.backgroundJob.updateMany({
    where: { entityId, entityType, status: "pending" },
    data: { status: "cancelled" },
  });

  log.info("jobs_cancelled_by_entity", { entityId, entityType, count });

  return count;
}

/**
 * Cancel all pending jobs in a specific group.
 */
export async function cancelJobsByGroup(groupKey: string): Promise<number> {
  const { count } = await prisma.backgroundJob.updateMany({
    where: { groupKey, status: "pending" },
    data: { status: "cancelled" },
  });

  log.info("jobs_cancelled_by_group", { groupKey, count });

  return count;
}

/**
 * Return status counts for all jobs belonging to an entity.
 */
export async function getJobStats(
  entityId: string,
  entityType: string,
): Promise<JobStats> {
  const rows = await prisma.backgroundJob.groupBy({
    by: ["status"],
    where: { entityId, entityType },
    _count: { status: true },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = row._count.status;
  }

  return {
    pending: counts["pending"] ?? 0,
    running: counts["running"] ?? 0,
    completed: counts["completed"] ?? 0,
    failed: counts["failed"] ?? 0,
    total: rows.reduce((sum, r) => sum + r._count.status, 0),
  };
}

/**
 * Check whether all non-finalize jobs in a group are done (completed or failed).
 * Excludes the given jobId and skips finalize job types.
 */
export async function getGroupCompletion(
  groupKey: string,
  excludeJobId: string,
): Promise<boolean> {
  const incomplete = await prisma.backgroundJob.count({
    where: {
      groupKey,
      id: { not: excludeJobId },
      type: { notIn: Array.from(FINALIZE_JOB_TYPES) },
      status: { notIn: ["completed", "failed", "cancelled"] },
    },
  });

  return incomplete === 0;
}

/**
 * Reset running jobs whose lockedAt is older than staleDurationMs back to pending.
 * Returns the number of jobs recovered.
 */
export async function recoverStaleJobs(staleDurationMs: number): Promise<number> {
  const staleThreshold = new Date(Date.now() - staleDurationMs);

  const { count } = await prisma.backgroundJob.updateMany({
    where: {
      status: "running",
      lockedAt: { lt: staleThreshold },
    },
    data: {
      status: "pending",
      lockedAt: null,
      lockedBy: null,
    },
  });

  if (count > 0) {
    log.warn("stale_jobs_recovered", { count, staleDurationMs });
  }

  return count;
}
