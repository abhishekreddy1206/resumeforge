import { NextResponse, after } from "next/server";
import { getInsightsData } from "@/lib/insights";
import { createLogger } from "@/lib/logger";

const log = createLogger("insights-route");

export async function GET() {
  // Fast path: return cached insights immediately and revalidate in the background.
  const cached = await getInsightsData({ cacheOnly: true });
  if (cached) {
    after(async () => {
      try {
        await getInsightsData({ force: true });
      } catch (error) {
        log.warn("background_revalidate_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return NextResponse.json({ ...cached, revalidating: true });
  }

  // Cold path: no cache exists yet. Compute synchronously (bounded by the
  // per-AI-call timeouts in getInsightsData) so the page has something to
  // render on first visit.
  const insights = await getInsightsData();
  if (!insights) {
    return NextResponse.json({ error: "No profile" }, { status: 404 });
  }
  return NextResponse.json({ ...insights, revalidating: false });
}
