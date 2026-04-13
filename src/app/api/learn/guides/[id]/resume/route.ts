import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GuideSectionValidationError, generateGuideSection } from "@/lib/claude";
import type { GuideContentStorage } from "@/lib/claude";
import { getActiveGuideSourceTexts, getGuideVersionSourceRefs, serializeGuideVersionSourceRefs } from "@/lib/learn-sources";
import { deriveGuideGenerationSnapshot, ensureGuideContentTracking } from "@/lib/learn-guides";
import { createLogger } from "@/lib/logger";

const log = createLogger("guide-resume");

const RESUME_BATCH_SIZE = 1;
const SECTION_ATTEMPTS_PER_RUN = 2;

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
      return NextResponse.json({ status: "published", generationState: "complete", remaining: 0, generated: 0, failedSectionIds: [] });
    }

    const content = ensureGuideContentTracking(JSON.parse(guide.content) as GuideContentStorage);
    const statuses = content._sectionStatuses || {};

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
      const snapshot = deriveGuideGenerationSnapshot(content, guide.status);
      if (snapshot.generationState === "complete") {
        await prisma.guide.update({
          where: { id },
          data: {
            status: "published",
            lastAsyncError: null,
            lastAsyncStage: null,
          },
        });
        return NextResponse.json({
          status: "published",
          generationState: "complete",
          remaining: 0,
          generated: 0,
          failedSectionIds: [],
        });
      }
      return NextResponse.json({
        status: "generating",
        generationState: snapshot.generationState,
        remaining: snapshot.remainingCount,
        generated: 0,
        failedSectionIds: snapshot.failedSectionIds,
      });
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

    log.info("generating_sections", { guideId: id, batchSize: batch.length, sections: batch.map((s) => s.title) });

    // Generate batch in parallel
    const results = await Promise.allSettled(
      batch.map((section) => {
        const planEntry = content._sectionPlan?.find((sp) => sp.id === section.id);
        const scope = planEntry?.scope || "";
        return generateGuideSection(
          guide.topic,
          { id: section.id, title: section.title, scope },
          { difficulty: content.difficulty, siblingTitles },
          {
            sources: sourceTexts.length > 0 ? sourceTexts : undefined,
            maxAttempts: SECTION_ATTEMPTS_PER_RUN,
          }
        );
      })
    );

    // Re-read guide to merge results (avoid overwriting concurrent updates)
    const currentGuide = await prisma.guide.findUnique({ where: { id } });
    if (!currentGuide) {
      return NextResponse.json({ error: "Guide disappeared" }, { status: 404 });
    }

    const currentContent = ensureGuideContentTracking(JSON.parse(currentGuide.content) as GuideContentStorage);
    const currentStatuses = currentContent._sectionStatuses || {};
    let generatedCount = 0;

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const sectionId = batch[j].id;
      if (result.status === "fulfilled") {
        const idx = currentContent.sections.findIndex((s) => s.id === sectionId);
        if (idx !== -1) currentContent.sections[idx] = result.value.section;
        currentStatuses[sectionId] = "completed";
        if (currentContent._sectionErrors) delete currentContent._sectionErrors[sectionId];
        if (currentContent._sectionAttempts) {
          currentContent._sectionAttempts[sectionId] =
            (currentContent._sectionAttempts[sectionId] || 0) + result.value.attempts;
        }
        generatedCount++;
      } else {
        log.error("section_generation_failed", { guideId: id, sectionTitle: batch[j].title, error: result.reason });
        currentStatuses[sectionId] = "failed";
        if (currentContent._sectionAttempts) {
          currentContent._sectionAttempts[sectionId] =
            (currentContent._sectionAttempts[sectionId] || 0) +
            (result.reason instanceof GuideSectionValidationError ? result.reason.attempts : 1);
        }
        if (currentContent._sectionErrors) {
          const message = result.reason instanceof GuideSectionValidationError
            ? result.reason.issues.join("; ")
            : result.reason instanceof Error
            ? result.reason.message
            : "Section generation failed";
          currentContent._sectionErrors[sectionId] = message.slice(0, 500);
        }
      }
    }

    currentContent._sectionStatuses = currentStatuses;

    const snapshot = deriveGuideGenerationSnapshot(currentContent, guide.status);
    const newStatus = snapshot.generationState === "complete" ? "published" : "generating";
    const lastAsyncError = snapshot.generationState === "complete"
      ? null
      : snapshot.failedSectionIds.length > 0
      ? `${snapshot.failedSectionIds.length} section${snapshot.failedSectionIds.length === 1 ? "" : "s"} blocked. Resume generation to retry.`
      : currentGuide.lastAsyncError;
    const lastAsyncStage = snapshot.generationState === "complete"
      ? null
      : snapshot.failedSectionIds.length > 0
      ? "create_sections"
      : currentGuide.lastAsyncStage;

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
          lastAsyncStage,
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

    const remaining = snapshot.remainingCount;
    log.info("generation_progress", { guideId: id, generated: generatedCount, batchSize: batch.length, remaining, status: newStatus });

    return NextResponse.json({
      status: newStatus,
      generationState: snapshot.generationState,
      remaining,
      generated: generatedCount,
      failedSectionIds: snapshot.failedSectionIds,
    });
  } catch (error) {
    log.error("guide_resume_failed", { error });
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
