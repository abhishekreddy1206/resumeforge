import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { GuideContentStorage } from "@/lib/claude";
import { enqueueJobs, cancelJobsByEntity } from "@/lib/job-queue";
import { deriveGuideGenerationSnapshot, ensureGuideContentTracking } from "@/lib/learn-guides";
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
    const statuses = content._sectionStatuses || {};

    // Reset stuck "generating" sections to "pending"
    for (const section of content.sections) {
      if (statuses[section.id] === "generating") {
        statuses[section.id] = "pending";
      }
    }

    // Find sections eligible for retry: pending or failed
    const eligibleSections = content.sections.filter(
      (s) => statuses[s.id] === "pending" || statuses[s.id] === "failed"
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

    const jobs = eligibleSections.map((section) => {
      const planEntry = sectionPlan.find((sp) => sp.id === section.id);
      return {
        type: "guide-section",
        payload: {
          guideId: id,
          topic: guide.topic,
          sectionPlan: {
            id: section.id,
            title: section.title,
            scope: planEntry?.scope || "",
          },
          difficulty: content.difficulty,
          siblingTitles,
        },
        opts: {
          priority: 10,
          maxAttempts: 3,
          groupKey,
          entityId: id,
          entityType: "guide",
        },
      };
    });

    await enqueueJobs(jobs);

    // Reset statuses and save
    for (const section of eligibleSections) {
      statuses[section.id] = "pending";
      if (content._sectionErrors) delete content._sectionErrors[section.id];
    }
    content._sectionStatuses = statuses;

    await prisma.guide.update({
      where: { id },
      data: {
        content: JSON.stringify(content),
        status: "generating",
        lastAsyncError: null,
        lastAsyncStage: null,
      },
    });

    const snapshot = deriveGuideGenerationSnapshot(content, "generating");

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
