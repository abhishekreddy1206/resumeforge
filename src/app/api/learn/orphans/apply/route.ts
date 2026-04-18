import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withLogging } from "@/lib/api-handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("orphans-apply");

interface ApplyBody {
  assignToExisting?: Array<{ guideId: string; pathId: string }>;
  newPaths?: Array<{ title: string; description?: string | null; category?: string | null; guideIds: string[] }>;
}

export const POST = withLogging(async (request: NextRequest) => {
  const profile = await prisma.profile.findFirst();
  if (!profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 404 });
  }

  let body: ApplyBody;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const assignToExisting = body.assignToExisting ?? [];
  const newPaths = body.newPaths ?? [];

  // Reject duplicates: each guideId may appear in only one section across the entire body.
  const seen = new Set<string>();
  const allBodyGuideIds = new Set<string>();
  const dupes: string[] = [];
  for (const entry of assignToExisting) {
    if (seen.has(entry.guideId)) dupes.push(entry.guideId);
    seen.add(entry.guideId);
    allBodyGuideIds.add(entry.guideId);
  }
  for (const np of newPaths) {
    for (const id of np.guideIds) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
      allBodyGuideIds.add(id);
    }
  }
  if (dupes.length > 0) {
    return NextResponse.json(
      { error: "Duplicate guideId across plan sections", duplicates: dupes },
      { status: 400 },
    );
  }

  // Reject 1-guide new paths.
  for (const np of newPaths) {
    if (!np.title || !np.title.trim()) {
      return NextResponse.json({ error: "New path title is required" }, { status: 400 });
    }
    if (np.guideIds.length < 2) {
      return NextResponse.json(
        { error: "New paths must contain at least 2 guides", offendingTitle: np.title },
        { status: 400 },
      );
    }
  }

  if (allBodyGuideIds.size === 0) {
    return NextResponse.json({ created: 0, assigned: 0, skipped: [] });
  }

  // Validate ownership and orphan-ness in a single query.
  const validatedGuides = await prisma.guide.findMany({
    where: {
      id: { in: Array.from(allBodyGuideIds) },
      profileId: profile.id,
      learningPathId: null,
    },
    select: { id: true },
  });
  const validatedIds = new Set(validatedGuides.map((g) => g.id));

  const skipped: Array<{ guideId: string; reason: string }> = [];
  for (const id of allBodyGuideIds) {
    if (!validatedIds.has(id)) {
      skipped.push({ guideId: id, reason: "Not orphan or not owned by profile" });
    }
  }

  // Validate path ownership for assignToExisting.
  const assignPathIds = Array.from(new Set(assignToExisting.map((e) => e.pathId)));
  const validPaths = assignPathIds.length > 0
    ? await prisma.learningPath.findMany({
        where: { id: { in: assignPathIds }, profileId: profile.id },
        select: { id: true },
      })
    : [];
  const validPathIds = new Set(validPaths.map((p) => p.id));

  const filteredAssign = assignToExisting
    .filter((e) => validatedIds.has(e.guideId))
    .filter((e) => {
      if (validPathIds.has(e.pathId)) return true;
      skipped.push({ guideId: e.guideId, reason: "Target path not owned by profile" });
      return false;
    });

  // Filter new paths: keep only validated guides; drop any path that falls below 2.
  const filteredNewPaths = newPaths
    .map((np) => ({
      ...np,
      guideIds: np.guideIds.filter((id) => validatedIds.has(id)),
    }))
    .filter((np) => np.guideIds.length >= 2);

  let created = 0;
  let assigned = 0;

  await prisma.$transaction(
    async (tx) => {
      // 1. Create new paths sequentially and assign their guides.
      for (const np of filteredNewPaths) {
        const path = await tx.learningPath.create({
          data: {
            title: np.title.trim(),
            description: np.description ?? null,
            category: np.category ?? null,
            profileId: profile.id,
            guideOrder: JSON.stringify(np.guideIds),
          },
        });
        await tx.guide.updateMany({
          where: { id: { in: np.guideIds } },
          data: { learningPathId: path.id },
        });
        created += 1;
        assigned += np.guideIds.length;
      }

      // 2. Apply existing-path assignments grouped by pathId, sequentially per path.
      const grouped = new Map<string, string[]>();
      for (const e of filteredAssign) {
        const arr = grouped.get(e.pathId) ?? [];
        arr.push(e.guideId);
        grouped.set(e.pathId, arr);
      }
      for (const [pathId, guideIds] of grouped) {
        const path = await tx.learningPath.findUnique({ where: { id: pathId }, select: { guideOrder: true } });
        if (!path) continue;
        let currentOrder: string[];
        try {
          currentOrder = JSON.parse(path.guideOrder) as string[];
        } catch {
          currentOrder = [];
        }
        const existing = new Set(currentOrder);
        const appended = [...currentOrder];
        for (const id of guideIds) {
          if (!existing.has(id)) {
            appended.push(id);
            existing.add(id);
          }
        }
        await tx.learningPath.update({
          where: { id: pathId },
          data: { guideOrder: JSON.stringify(appended) },
        });
        await tx.guide.updateMany({
          where: { id: { in: guideIds } },
          data: { learningPathId: pathId },
        });
        assigned += guideIds.length;
      }
    },
    { timeout: 30_000 },
  );

  log.info("plan_applied", { created, assigned, skipped: skipped.length });

  return NextResponse.json({ created, assigned, skipped });
});
