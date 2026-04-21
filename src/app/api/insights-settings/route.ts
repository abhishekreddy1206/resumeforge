import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withLogging } from "@/lib/api-handler";
import {
  DEFAULT_INSIGHTS_SETTINGS,
  parseInsightsSettingsJson,
  resolveInsightsSettings,
  validateInsightsSettings,
  type InsightsSettings,
} from "@/lib/insights/settings";

export const GET = withLogging(async () => {
  const profile = await prisma.profile.findFirst({
    select: { id: true, insightsSettings: true },
  });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
  const stored = parseInsightsSettingsJson(profile.insightsSettings);
  return NextResponse.json({
    settings: resolveInsightsSettings(stored),
    defaults: DEFAULT_INSIGHTS_SETTINGS,
  });
});

export const PUT = withLogging(async (req: Request) => {
  const profile = await prisma.profile.findFirst({
    select: { id: true, insightsSettings: true },
  });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  let body: Partial<InsightsSettings> = {};
  try {
    body = (await req.json()) as Partial<InsightsSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Merge with existing stored settings so a partial PUT doesn't clobber
  // unrelated fields back to defaults.
  const existing = parseInsightsSettingsJson(profile.insightsSettings);
  const merged: Partial<InsightsSettings> = { ...existing, ...body };

  const { value, errors } = validateInsightsSettings(merged);
  await prisma.profile.update({
    where: { id: profile.id },
    data: { insightsSettings: JSON.stringify(value) },
  });

  return NextResponse.json({
    settings: value,
    defaults: DEFAULT_INSIGHTS_SETTINGS,
    warnings: errors,
  });
});
