import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withLogging } from "@/lib/api-handler";
import { enqueueJobClassifications } from "@/lib/insights/enqueue-classification";
import { safeJsonParse } from "@/lib/utils/json";

export const POST = withLogging(async () => {
  const profile = await prisma.profile.findFirst({ select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const unclassified = await prisma.job.findMany({
    where: { roleCategory: null },
    select: { id: true },
  });

  // Dedup against already-in-flight classify-jobs-batch BackgroundJobs so
  // repeated Retry clicks don't pile up duplicate work.
  const inFlight = await prisma.backgroundJob.findMany({
    where: { type: "classify-jobs-batch", status: { in: ["pending", "running"] } },
    select: { payload: true },
  });
  const inFlightIds = new Set<string>();
  for (const row of inFlight) {
    const payload = safeJsonParse<{ jobIds?: string[] }>(row.payload, {});
    if (Array.isArray(payload.jobIds)) {
      for (const id of payload.jobIds) inFlightIds.add(id);
    }
  }

  const toEnqueue = unclassified.map((j) => j.id).filter((id) => !inFlightIds.has(id));
  await enqueueJobClassifications(toEnqueue);
  return NextResponse.json({
    enqueued: toEnqueue.length,
    skippedInFlight: unclassified.length - toEnqueue.length,
  });
});
