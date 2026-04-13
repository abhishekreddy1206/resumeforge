import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuideSection } from "@/lib/claude";
import type { GuideContentStorage, SectionGenStatus } from "@/lib/claude";
import { getActiveGuideSourceTexts, getGuideVersionSourceRefs, serializeGuideVersionSourceRefs } from "@/lib/learn-sources";

const RESUME_BATCH_SIZE = 1;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({ where: { id } });
    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    // Already done — nothing to resume
    if (guide.status === "published") {
      return NextResponse.json({ status: "published", remaining: 0 });
    }

    const content = JSON.parse(guide.content) as GuideContentStorage;
    const statuses = content._sectionStatuses || {};

    // Backfill _sectionStatuses for guides created before status tracking was added
    if (Object.keys(statuses).length === 0 && content.sections.length > 0) {
      for (const section of content.sections) {
        statuses[section.id] = section.explanation && section.explanation.length > 0
          ? "completed"
          : "pending";
      }
      content._sectionStatuses = statuses;
      console.log(`[guide-resume] Backfilled _sectionStatuses for guide ${id}: ${JSON.stringify(statuses)}`);
    }

    // Stall detection: reset sections stuck in "generating" for too long
    // Do NOT reset "refining" sections — those are being handled by the refine endpoint's after()
    for (const section of content.sections) {
      if (statuses[section.id] === "generating") {
        // If no timestamp tracking, just reset — it's been called by auto-resume which means it stalled
        statuses[section.id] = "pending";
      }
    }

    // Find sections eligible for generation: pending or failed
    const eligibleSections = content.sections.filter(
      (s) => statuses[s.id] === "pending" || statuses[s.id] === "failed"
    );

    if (eligibleSections.length === 0) {
      // All sections are either completed, generating, or refining
      const allDone = content.sections.every((s) => statuses[s.id] === "completed" || statuses[s.id] === "refining");
      if (allDone) {
        // If some are refining, don't change status — refine's after() will handle it
        const hasRefining = content.sections.some((s) => statuses[s.id] === "refining");
        if (!hasRefining) {
          await prisma.guide.update({
            where: { id },
            data: {
              status: "published",
              lastAsyncError: null,
              lastAsyncStage: null,
            },
          });
          return NextResponse.json({ status: "published", remaining: 0 });
        }
        // Refining in progress — nothing for resume to do
        return NextResponse.json({ status: "generating", remaining: 0, generated: 0 });
      }
      return NextResponse.json({ status: "generating", remaining: 0, generated: 0 });
    }

    // Pick up to RESUME_BATCH_SIZE sections to generate
    const batch = eligibleSections.slice(0, RESUME_BATCH_SIZE);
    const siblingTitles = content.sections.map((s) => s.title);

    // Load active source snapshots only so resume uses pinned guide inputs.
    const sourceTexts = await getActiveGuideSourceTexts(guide.id);

    // Mark batch as "generating"
    for (const section of batch) {
      statuses[section.id] = "generating";
    }
    content._sectionStatuses = statuses;
    await prisma.guide.update({
      where: { id },
      data: {
        content: JSON.stringify(content),
        status: "generating",
      },
    });

    console.log(`[guide-resume] Generating ${batch.length} sections for guide ${id}: ${batch.map((s) => s.title).join(", ")}`);

    // Generate batch in parallel
    const results = await Promise.allSettled(
      batch.map((section) => {
        const planEntry = content._sectionPlan?.find((sp) => sp.id === section.id);
        const scope = planEntry?.scope || "";
        return generateGuideSection(
          guide.topic,
          { id: section.id, title: section.title, scope },
          { difficulty: content.difficulty, siblingTitles },
          { sources: sourceTexts.length > 0 ? sourceTexts : undefined }
        );
      })
    );

    // Re-read guide to merge results (avoid overwriting concurrent updates)
    const currentGuide = await prisma.guide.findUnique({ where: { id } });
    if (!currentGuide) {
      return NextResponse.json({ error: "Guide disappeared" }, { status: 404 });
    }

    const currentContent = JSON.parse(currentGuide.content) as GuideContentStorage;
    const currentStatuses = currentContent._sectionStatuses || {};
    let generatedCount = 0;

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const sectionId = batch[j].id;
      if (result.status === "fulfilled") {
        const idx = currentContent.sections.findIndex((s) => s.id === sectionId);
        if (idx !== -1) currentContent.sections[idx] = result.value;
        currentStatuses[sectionId] = "completed";
        generatedCount++;
      } else {
        console.error(`[guide-resume] Section "${batch[j].title}" failed:`, result.reason);
        currentStatuses[sectionId] = "failed";
      }
    }

    currentContent._sectionStatuses = currentStatuses;

    // Derive overall status from section statuses
    const allStatuses = Object.values(currentStatuses) as SectionGenStatus[];
    const allCompleted = allStatuses.every((s) => s === "completed");
    const failedCount = allStatuses.filter((s) => s === "failed").length;
    const allFailed = allStatuses.every((s) => s === "failed");
    const remaining = allStatuses.filter((s) => s === "pending" || s === "failed").length;

    const newStatus = allCompleted ? "published" : allFailed ? "failed" : "generating";
    const lastAsyncError = failedCount > 0
      ? allFailed
        ? "Guide generation failed. Resume generation to retry."
        : `${failedCount} section${failedCount === 1 ? "" : "s"} failed to generate. Resume generation to retry.`
      : null;

    const sourceRefs = newStatus === "published"
      ? await getGuideVersionSourceRefs(guide.id)
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.guide.update({
        where: { id },
        data: {
          content: JSON.stringify(currentContent),
          status: newStatus,
          lastAsyncError,
          lastAsyncStage: failedCount > 0 ? "create_sections" : null,
        },
      });

      if (newStatus === "published") {
        await tx.guideVersion.upsert({
          where: {
            guideId_version: {
              guideId: guide.id,
              version: guide.version,
            },
          },
          create: {
            guideId: guide.id,
            version: guide.version,
            content: JSON.stringify(currentContent),
            changeDescription: "Initial guide generation",
            snapshotSemantics: "current_head",
            sourceRefs: serializeGuideVersionSourceRefs(sourceRefs || []),
          },
          update: {
            content: JSON.stringify(currentContent),
            changeDescription: "Initial guide generation",
            snapshotSemantics: "current_head",
            sourceRefs: serializeGuideVersionSourceRefs(sourceRefs || []),
          },
        });
      }
    });

    console.log(`[guide-resume] Guide ${id}: ${generatedCount}/${batch.length} ok, ${remaining} remaining -> ${newStatus}`);

    return NextResponse.json({
      status: newStatus,
      remaining,
      generated: generatedCount,
    });
  } catch (error) {
    console.error("Guide resume error:", error);
    const { id } = await params;
    await prisma.guide.update({
      where: { id },
      data: {
        lastAsyncError: error instanceof Error ? error.message.slice(0, 500) : "Guide resume failed",
        lastAsyncStage: "create_sections",
      },
    }).catch(() => {});
    return NextResponse.json({ error: "Failed to resume guide generation" }, { status: 500 });
  }
}
