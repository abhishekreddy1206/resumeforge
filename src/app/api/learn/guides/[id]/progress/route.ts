import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getJobStats } from "@/lib/job-queue";
import { parseTrackingColumn } from "@/lib/learn-guides";
import type { SectionGenStatus } from "@/lib/claude";

const POLL_INTERVAL_MS = 2000;
const STALL_THRESHOLD_MS = 5 * 60 * 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let lastStateKey = "";

      const poll = async () => {
        if (closed) return;

        try {
          // Select only tracking columns — no content blob
          const guide = await prisma.guide.findFirst({
            where: { OR: [{ id }, { slug: id }] },
            select: {
              id: true,
              status: true,
              sectionStatuses: true,
              sectionErrors: true,
              updatedAt: true,
            },
          });

          if (!guide) {
            send({ error: "Guide not found", done: true });
            closed = true;
            controller.close();
            return;
          }

          const sectionStatuses = parseTrackingColumn<Record<string, SectionGenStatus>>(
            guide.sectionStatuses, {}
          );
          const sectionErrors = parseTrackingColumn<Record<string, string>>(
            guide.sectionErrors, {}
          );
          const jobs = await getJobStats(guide.id, "guide");

          // Stall: no tracking-column change for >STALL_THRESHOLD_MS while
          // there are still jobs pending/running. Usually means the worker
          // crashed or got stuck — user should be offered a resume.
          const staleForMs = Date.now() - guide.updatedAt.getTime();
          const hasInflight = jobs.pending > 0 || jobs.running > 0;
          const stallDetected =
            guide.status === "generating" &&
            hasInflight &&
            staleForMs >= STALL_THRESHOLD_MS;

          const state = {
            status: guide.status,
            sectionStatuses,
            sectionErrors,
            jobs,
            stallDetected,
            lastProgressAt: guide.updatedAt.toISOString(),
            done: guide.status === "published" || guide.status === "failed",
          };

          const stateKey = JSON.stringify(state);
          if (stateKey !== lastStateKey) {
            lastStateKey = stateKey;
            send(state);
          }

          if (state.done) {
            closed = true;
            controller.close();
            return;
          }
        } catch {
          // Ignore poll errors — will retry on next interval
        }
      };

      // Send initial state immediately
      await poll();

      if (closed) return;

      const interval = setInterval(poll, POLL_INTERVAL_MS);

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
