import { prisma } from "@/lib/db";
import type { AppSettings } from "@/generated/prisma/client";

const SINGLETON_ID = "singleton";
const ALLOWED_MODELS = new Set(["sonnet", "opus"]);

export async function getAppSettings(): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

export interface AppSettingsInput {
  matchScoreFloor?: number;
  qualityScoreFloor?: number;
  defaultAiModel?: string;
  claudeCliConcurrency?: number;
}

function clampInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function updateAppSettings(input: AppSettingsInput): Promise<AppSettings> {
  const data: Record<string, unknown> = {};

  const matchFloor = clampInt(input.matchScoreFloor, 0, 100);
  if (matchFloor !== undefined) data.matchScoreFloor = matchFloor;

  const qualityFloor = clampInt(input.qualityScoreFloor, 0, 100);
  if (qualityFloor !== undefined) data.qualityScoreFloor = qualityFloor;

  if (typeof input.defaultAiModel === "string" && ALLOWED_MODELS.has(input.defaultAiModel)) {
    data.defaultAiModel = input.defaultAiModel;
  }

  const concurrency = clampInt(input.claudeCliConcurrency, 1, 8);
  if (concurrency !== undefined) data.claudeCliConcurrency = concurrency;

  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
}
