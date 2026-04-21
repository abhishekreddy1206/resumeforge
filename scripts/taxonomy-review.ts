#!/usr/bin/env node
import {
  computeTaxonomyGaps,
  listPendingRecommendations,
} from "../src/lib/insights/taxonomy-recommendations";
import { prisma } from "../src/lib/db";

async function main(): Promise<void> {
  const { created } = await computeTaxonomyGaps({ minJobs: 5 });
  console.log(`Created ${created} new recommendation(s).`);
  const pending = await listPendingRecommendations();
  if (pending.length === 0) {
    console.log("No pending recommendations.");
    return;
  }
  console.log(`\nPending taxonomy recommendations (${pending.length}):\n`);
  for (const r of pending) {
    const skills = JSON.parse(r.signalKeywords) as string[];
    console.log(`- [${r.id}] ${r.suggestedName}`);
    console.log(`    supporting jobs: ${r.supportingJobCount}`);
    console.log(`    top signal keywords: ${skills.slice(0, 8).join(", ")}`);
    console.log("");
  }
  console.log(
    `To accept one: manually add it to role-taxonomy.ts, bump TAXONOMY_VERSION, then UPDATE TaxonomyRecommendation SET status='accepted' WHERE id='<id>';`
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
