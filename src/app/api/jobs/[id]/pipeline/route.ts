import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";
import { createLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";

const log = createLogger("jobs-pipeline");

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export const POST = withLogging(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: jobId } = await params;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!job.skills) {
    return NextResponse.json(
      { error: "Job has not been analyzed yet — pipeline requires analysis data" },
      { status: 400 }
    );
  }

  // Guard against double-trigger — allow retry if stale (process likely died)
  if (
    job.pipelineStatus === "running" &&
    job.pipelineStartedAt &&
    Date.now() - job.pipelineStartedAt.getTime() < STALE_THRESHOLD_MS
  ) {
    return NextResponse.json(
      { error: "Pipeline already running", stage: job.pipelineStage, startedAt: job.pipelineStartedAt },
      { status: 409 }
    );
  }

  // Skip enqueue if there's already a pending/running auto-pipeline job for this
  // job in the queue — prevents duplicate runs from rapid retry clicks.
  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type: "auto-pipeline",
      entityId: jobId,
      status: { in: ["pending", "running"] },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return NextResponse.json(
      { jobId, pipelineStatus: "running", backgroundJobId: existing.id },
      { status: 202 }
    );
  }

  log.info("pipeline_retry", { jobId, previousStatus: job.pipelineStatus, previousStage: job.pipelineStage });

  const enqueued = await enqueueJob(
    "auto-pipeline",
    { jobId },
    { entityId: jobId, entityType: "job", maxAttempts: 3 }
  );

  return NextResponse.json(
    { jobId, pipelineStatus: "running", backgroundJobId: enqueued.id },
    { status: 202 }
  );
});
