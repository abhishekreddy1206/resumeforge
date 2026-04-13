import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getJobStats } from "@/lib/job-queue";
import type { GuideContentStorage } from "@/lib/claude";
import { ensureGuideContentTracking } from "@/lib/learn-guides";

const POLL_INTERVAL_MS = 2000;

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
          const guide = await prisma.guide.findFirst({
            where: { OR: [{ id }, { slug: id }] },
          });

          if (!guide) {
            send({ error: "Guide not found", done: true });
            closed = true;
            controller.close();
            return;
          }

          const content = ensureGuideContentTracking(
            JSON.parse(guide.content) as GuideContentStorage
          );
          const jobs = await getJobStats(guide.id, "guide");

          const state = {
            status: guide.status,
            sectionStatuses: content._sectionStatuses || {},
            sectionErrors: content._sectionErrors || {},
            jobs,
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
