import { NextResponse } from "next/server";
import { getInsightsData } from "@/lib/insights";

export async function GET() {
  const insights = await getInsightsData();
  if (!insights) {
    return NextResponse.json({ error: "No profile" }, { status: 404 });
  }
  return NextResponse.json(insights);
}
