import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withLogging } from "@/lib/api-handler";
import { enqueueJobClassifications } from "@/lib/insights/enqueue-classification";

export const POST = withLogging(async () => {
  const profile = await prisma.profile.findFirst({ select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
  const unclassified = await prisma.job.findMany({
    where: { roleCategory: null },
    select: { id: true },
  });
  await enqueueJobClassifications(unclassified.map((j) => j.id));
  return NextResponse.json({ enqueued: unclassified.length });
});
