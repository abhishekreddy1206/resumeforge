export type ClusterSortOrder = "jobCount" | "avgScore" | "alphabetical";
export type ClassificationModel = "sonnet" | "haiku";

export interface InsightsSettings {
  realisticScoreThreshold: number;
  classificationBatchSize: number;
  classificationConfidenceThreshold: number;
  classificationModel: ClassificationModel;
  clusterSortOrder: ClusterSortOrder;
  otherSubClusterMinJobs: number;
}

export const DEFAULT_INSIGHTS_SETTINGS: InsightsSettings = {
  realisticScoreThreshold: 60,
  classificationBatchSize: 10,
  classificationConfidenceThreshold: 60,
  classificationModel: "sonnet",
  clusterSortOrder: "jobCount",
  otherSubClusterMinJobs: 5,
};

const CLAMPS = {
  realisticScoreThreshold: { min: 0, max: 100 },
  classificationBatchSize: { min: 1, max: 50 },
  classificationConfidenceThreshold: { min: 0, max: 100 },
  otherSubClusterMinJobs: { min: 3, max: 20 },
} as const;

const ALLOWED_MODELS: ClassificationModel[] = ["sonnet", "haiku"];
const ALLOWED_SORT: ClusterSortOrder[] = ["jobCount", "avgScore", "alphabetical"];

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function parseInsightsSettingsJson(raw: unknown): Partial<InsightsSettings> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<InsightsSettings>;
    }
  } catch {
    // fall through
  }
  return {};
}

export function resolveInsightsSettings(
  input: Partial<InsightsSettings> | null | undefined
): InsightsSettings {
  return { ...DEFAULT_INSIGHTS_SETTINGS, ...(input || {}) };
}

export interface ValidateResult {
  value: InsightsSettings;
  errors: string[];
}

export function validateInsightsSettings(
  input: Partial<InsightsSettings>
): ValidateResult {
  const errors: string[] = [];
  const out: InsightsSettings = { ...DEFAULT_INSIGHTS_SETTINGS };

  const numericFields: Array<keyof typeof CLAMPS> = [
    "realisticScoreThreshold",
    "classificationBatchSize",
    "classificationConfidenceThreshold",
    "otherSubClusterMinJobs",
  ];

  for (const field of numericFields) {
    const v = input[field];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`${field} must be a finite number`);
      continue;
    }
    const { min, max } = CLAMPS[field];
    if (v < min || v > max) {
      errors.push(`${field} out of range [${min}, ${max}], clamped`);
    }
    out[field] = clamp(Math.round(v), min, max);
  }

  if (input.classificationModel !== undefined) {
    if (!ALLOWED_MODELS.includes(input.classificationModel as ClassificationModel)) {
      errors.push(`classificationModel must be one of ${ALLOWED_MODELS.join(", ")}`);
    } else {
      out.classificationModel = input.classificationModel as ClassificationModel;
    }
  }

  if (input.clusterSortOrder !== undefined) {
    if (!ALLOWED_SORT.includes(input.clusterSortOrder as ClusterSortOrder)) {
      errors.push(`clusterSortOrder must be one of ${ALLOWED_SORT.join(", ")}`);
    } else {
      out.clusterSortOrder = input.clusterSortOrder as ClusterSortOrder;
    }
  }

  return { value: out, errors };
}

export function loadInsightsSettingsFromProfile(
  profile: { insightsSettings: string | null }
): InsightsSettings {
  return resolveInsightsSettings(parseInsightsSettingsJson(profile.insightsSettings));
}
