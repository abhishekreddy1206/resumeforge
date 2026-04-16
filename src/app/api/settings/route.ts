import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, updateAppSettings } from "@/lib/app-settings";
import { withLogging } from "@/lib/api-handler";

export const GET = withLogging(async () => {
  const settings = await getAppSettings();
  return NextResponse.json(settings);
});

export const PUT = withLogging(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const updated = await updateAppSettings(body);
  return NextResponse.json(updated);
});
