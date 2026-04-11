import { NextResponse } from "next/server";
import { refreshRecommendationsCache } from "@/lib/learn-cache";

export async function GET() {
  try {
    const recommendations = await refreshRecommendationsCache();
    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
