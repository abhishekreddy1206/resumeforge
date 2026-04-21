#!/usr/bin/env node
import { prisma } from "../src/lib/db";
import { enqueueJobClassifications } from "../src/lib/insights/enqueue-classification";

async function main(): Promise<void> {
  const unclassified = await prisma.job.findMany({
    where: { roleCategory: null },
    select: { id: true },
  });
  console.log(`Found ${unclassified.length} unclassified jobs.`);
  if (unclassified.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  await enqueueJobClassifications(unclassified.map((j) => j.id));
  console.log(
    `Enqueued classification jobs. Start the worker (npm run worker) to process them.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
