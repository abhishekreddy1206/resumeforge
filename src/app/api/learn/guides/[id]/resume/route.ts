import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { GuideContentStorage } from "@/lib/claude";
import { enqueueJobs, cancelJobsByEntity } from "@/lib/job-queue";
import { deriveGuideGenerationSnapshot, ensureGuideContentTracking, isSectionCurrentlyInteractive } from "@/lib/learn-guides";
import { createLogger } from "@/lib/logger";

const log = createLogger("guide-resume");

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

    if (guide.status === "published") {
      return NextResponse.json({
        status: "published",
        generationState: "complete",
        remaining: 0,
        generated: 0,
        failedSectionIds: [],
      });
    }

    const content = ensureGuideContentTracking(JSON.parse(guide.content) as GuideContentStorage);
    const statuses: Record<string, string> = guide.sectionStatuses
      ? JSON.parse(guide.sectionStatuses)
      : { ...(content._sectionStatuses || {}) };

    // Reset stuck "generating"/"generating_interactive" sections
    for (const section of content.sections) {
      if (statuses[section.id] === "generating") {
        statuses[section.id] = "pending";
      } else if (statuses[section.id] === "generating_interactive") {
        statuses[section.id] = "core_complete";
      }
    }

    // Find sections eligible for retry: pending, failed, or core_complete (needs interactive)
    const eligibleSections = content.sections.filter(
      (s) => statuses[s.id] === "pending" || statuses[s.id] === "failed" || statuses[s.id] === "core_complete"
    );

    if (eligibleSections.length === 0) {
      const snapshot = deriveGuideGenerationSnapshot(content, guide.status);
      if (snapshot.generationState === "complete") {
        await prisma.guide.update({
          where: { id },
          data: { status: "published", lastAsyncError: null, lastAsyncStage: null },
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

    // Cancel stale jobs and re-enqueue
    await cancelJobsByEntity(id, "guide");

    const groupKey = `resume-${id}-${Date.now()}`;
    const sectionPlan = content._sectionPlan || [];
    const siblingTitles = content.sections.map((s) => s.title);

    // Smart phase detection: only enqueue the phase(s) each section needs
    const jobs: Array<{ type: string; payload: Record<string, unknown>; opts: Record<string, unknown> }> = [];
    for (const section of eligibleSections) {
      const planEntry = sectionPlan.find((sp) => sp.id === section.id);
      const sectionPlanPayload = {
        id: section.id,
        title: section.title,
        scope: planEntry?.scope || "",
      };

      const hasCoreContent = Boolean(section.explanation?.trim()) && !isSectionCurrentlyInteractive(section);
      const needsCoreOnly = statuses[section.id] === "pending" || statuses[section.id] === "failed";
      const needsInteractiveOnly = statuses[section.id] === "core_complete" || hasCoreContent;

      if (needsInteractiveOnly && !needsCoreOnly) {
        // Has core content, just needs interactive phase
        jobs.push({
          type: "guide-section-interactive",
          payload: {
            guideId: id,
            topic: guide.topic,
            sectionPlan: sectionPlanPayload,
            difficulty: content.difficulty,
            model: undefined,
          },
          opts: {
            priority: 10,
            maxAttempts: 3,
            groupKey,
            entityId: id,
            entityType: "guide",
          },
        });
      } else {
        // Needs both phases
        jobs.push({
          type: "guide-section-core",
          payload: {
            guideId: id,
            topic: guide.topic,
            sectionPlan: sectionPlanPayload,
            difficulty: content.difficulty,
            siblingTitles,
            model: undefined,
          },
          opts: {
            priority: 20,
            maxAttempts: 3,
            groupKey,
            entityId: id,
            entityType: "guide",
          },
        });
        jobs.push({
          type: "guide-section-interactive",
          payload: {
            guideId: id,
            topic: guide.topic,
            sectionPlan: sectionPlanPayload,
            difficulty: content.difficulty,
            model: undefined,
          },
          opts: {
            priority: 10,
            maxAttempts: 3,
            groupKey,
            entityId: id,
            entityType: "guide",
          },
        });
      }
    }

    await enqueueJobs(jobs);

    // Reset statuses and save
    const errors: Record<string, string> = guide.sectionErrors
      ? JSON.parse(guide.sectionErrors)
      : { ...(content._sectionErrors || {}) };
    for (const section of eligibleSections) {
      // Preserve core_complete status for sections that only need interactive retry
      if (statuses[section.id] === "core_complete") {
        // Keep as core_complete — only interactive phase will be enqueued
      } else {
        statuses[section.id] = "pending";
      }
      delete errors[section.id];
    }

    await prisma.guide.update({
      where: { id },
      data: {
        status: "generating",
        sectionStatuses: JSON.stringify(statuses),
        sectionErrors: JSON.stringify(errors),
        lastAsyncError: null,
        lastAsyncStage: null,
      },
    });

    const { deriveGuideGenerationSnapshotFromColumns } = await import("@/lib/learn-guides");
    const sectionIds = content.sections.map((s) => s.id);
    const snapshot = deriveGuideGenerationSnapshotFromColumns(sectionIds, statuses as Record<string, import("@/lib/claude").SectionGenStatus>, "generating");

    log.info("guide_resumed", { guideId: id, jobCount: jobs.length, groupKey });

    return NextResponse.json({
      status: "generating",
      generationState: "running",
      remaining: snapshot.remainingCount,
      generated: 0,
      failedSectionIds: [],
    });
  } catch (error) {
    log.error("guide_resume_failed", { error });
    return NextResponse.json({ error: "Failed to resume guide generation" }, { status: 500 });
  }
}
