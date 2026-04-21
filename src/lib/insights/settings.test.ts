import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INSIGHTS_SETTINGS,
  resolveInsightsSettings,
  parseInsightsSettingsJson,
  validateInsightsSettings,
} from "./settings";

test("default settings have expected values", () => {
  assert.equal(DEFAULT_INSIGHTS_SETTINGS.realisticScoreThreshold, 60);
  assert.equal(DEFAULT_INSIGHTS_SETTINGS.classificationBatchSize, 10);
  assert.equal(DEFAULT_INSIGHTS_SETTINGS.classificationConfidenceThreshold, 60);
  assert.equal(DEFAULT_INSIGHTS_SETTINGS.classificationModel, "sonnet");
  assert.equal(DEFAULT_INSIGHTS_SETTINGS.clusterSortOrder, "jobCount");
  assert.equal(DEFAULT_INSIGHTS_SETTINGS.otherSubClusterMinJobs, 5);
});

test("resolve merges stored overrides onto defaults", () => {
  const merged = resolveInsightsSettings({ classificationBatchSize: 20 });
  assert.equal(merged.classificationBatchSize, 20);
  assert.equal(merged.realisticScoreThreshold, 60);
});

test("resolve falls back to defaults when input is null or undefined", () => {
  assert.deepEqual(resolveInsightsSettings(null), DEFAULT_INSIGHTS_SETTINGS);
  assert.deepEqual(resolveInsightsSettings(undefined), DEFAULT_INSIGHTS_SETTINGS);
});

test("parseInsightsSettingsJson handles null, undefined, invalid JSON", () => {
  assert.deepEqual(parseInsightsSettingsJson(null), {});
  assert.deepEqual(parseInsightsSettingsJson(undefined), {});
  assert.deepEqual(parseInsightsSettingsJson("not json"), {});
  assert.deepEqual(parseInsightsSettingsJson("{\"classificationBatchSize\":20}"), {
    classificationBatchSize: 20,
  });
});

test("validate clamps out-of-range values and rejects invalid enums", () => {
  const result = validateInsightsSettings({
    realisticScoreThreshold: 150,
    classificationBatchSize: 999,
    classificationModel: "gpt5" as unknown as "sonnet",
    clusterSortOrder: "bogus" as unknown as "jobCount",
    otherSubClusterMinJobs: 1,
  });
  assert.ok(result.errors.length >= 3);
  assert.equal(result.value.realisticScoreThreshold, 100);
  assert.equal(result.value.classificationBatchSize, 50);
  assert.equal(result.value.classificationModel, "sonnet");
  assert.equal(result.value.clusterSortOrder, "jobCount");
  assert.equal(result.value.otherSubClusterMinJobs, 3);
});

test("validate passes through valid settings unchanged", () => {
  const input = {
    realisticScoreThreshold: 70,
    classificationBatchSize: 15,
    classificationConfidenceThreshold: 55,
    classificationModel: "haiku" as const,
    clusterSortOrder: "avgScore" as const,
    otherSubClusterMinJobs: 7,
  };
  const result = validateInsightsSettings(input);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.value, input);
});
