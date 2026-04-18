import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withLogging } from "@/lib/api-handler";
import { createLogger } from "@/lib/logger";
import { organizeOrphanGuides, type OrphanOrganizationPlan } from "@/lib/claude";

const log = createLogger("orphans-organize");

export const POST = withLogging(async () => {
  const profile = await prisma.profile.findFirst();
  if (!profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 404 });
  }

  const orphans = await prisma.guide.findMany({
    where: {
      profileId: profile.id,
      learningPathId: null,
      status: { not: "generating" },
    },
    select: { id: true, topic: true, category: true },
  });

  if (orphans.length === 0) {
    return NextResponse.json({ orphans: 0, plan: null });
  }

  const paths = await prisma.learningPath.findMany({
    where: { profileId: profile.id },
    select: {
      id: true,
      title: true,
      description: true,
      guides: { select: { topic: true } },
    },
  });

  const pathInputs = paths.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    existingTopics: p.guides.map((g) => g.topic),
  }));

  let raw: OrphanOrganizationPlan;
  try {
    raw = await organizeOrphanGuides(orphans, pathInputs);
  } catch (error) {
    log.error("ai_failed", { error: error instanceof Error ? error : new Error(String(error)) });
    return NextResponse.json({ error: "Could not organize orphans. Please try again." }, { status: 502 });
  }

  // Validate AI output: drop unknown IDs, de-dupe across sections, collapse <2-guide new paths.
  const orphanById = new Map(orphans.map((o) => [o.id, o]));
  const pathById = new Map(paths.map((p) => [p.id, p]));
  const claimed = new Set<string>();

  const assignToExisting = (raw.assignToExisting ?? [])
    .filter((entry) => orphanById.has(entry.guideId) && pathById.has(entry.pathId) && !claimed.has(entry.guideId))
    .map((entry) => {
      claimed.add(entry.guideId);
      const guide = orphanById.get(entry.guideId)!;
      const path = pathById.get(entry.pathId)!;
      return {
        guideId: entry.guideId,
        guideTopic: guide.topic,
        pathId: entry.pathId,
        pathTitle: path.title,
        reason: entry.reason ?? "",
      };
    });

  const newPathsRaw = (raw.newPaths ?? []).map((np) => {
    const validIds = (np.guideIds ?? []).filter((id) => orphanById.has(id) && !claimed.has(id));
    return { ...np, validIds };
  });

  const newPaths: Array<{
    title: string;
    description: string;
    category: string | null;
    guides: Array<{ id: string; topic: string }>;
    reason: string;
  }> = [];

  const droppedFromNewPaths: string[] = [];
  for (const np of newPathsRaw) {
    if (np.validIds.length >= 2) {
      np.validIds.forEach((id) => claimed.add(id));
      newPaths.push({
        title: np.title,
        description: np.description ?? "",
        category: np.category ?? null,
        guides: np.validIds.map((id) => ({ id, topic: orphanById.get(id)!.topic })),
        reason: np.reason ?? "",
      });
    } else {
      // Below threshold — collapse into leaveAlone (handled below).
      droppedFromNewPaths.push(...np.validIds);
    }
  }

  const leaveAloneSet = new Map<string, string>();
  for (const entry of raw.leaveAlone ?? []) {
    if (orphanById.has(entry.guideId) && !claimed.has(entry.guideId)) {
      leaveAloneSet.set(entry.guideId, entry.reason ?? "");
      claimed.add(entry.guideId);
    }
  }
  for (const id of droppedFromNewPaths) {
    if (!claimed.has(id)) {
      leaveAloneSet.set(id, "Group fell below 2 guides after validation.");
      claimed.add(id);
    }
  }
  // Any orphan the AI forgot about → leaveAlone.
  for (const o of orphans) {
    if (!claimed.has(o.id)) {
      leaveAloneSet.set(o.id, "Not classified by AI.");
    }
  }

  const leaveAlone = Array.from(leaveAloneSet.entries()).map(([guideId, reason]) => ({
    guideId,
    guideTopic: orphanById.get(guideId)!.topic,
    reason,
  }));

  log.info("plan_built", {
    orphans: orphans.length,
    assigned: assignToExisting.length,
    newPaths: newPaths.length,
    leaveAlone: leaveAlone.length,
  });

  return NextResponse.json({
    orphans: orphans.length,
    plan: { assignToExisting, newPaths, leaveAlone },
  });
});
