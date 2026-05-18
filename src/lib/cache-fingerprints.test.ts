import test from "node:test";
import assert from "node:assert/strict";
import { hashJobSubstance } from "@/lib/cache-fingerprints";

const baseJob = {
  id: "job-1",
  matchedAt: new Date("2026-04-01T12:00:00Z"),
  matchResult: JSON.stringify({ score: 80, breakdown: { gaps: ["kubernetes"] } }),
  terminologyMap: JSON.stringify([{ jdTerm: "k8s", resumeSynonyms: ["kubernetes"] }]),
  description: "We are looking for a Senior Engineer with k8s experience.",
};

test("hashJobSubstance: deterministic for identical inputs", () => {
  assert.equal(hashJobSubstance(baseJob), hashJobSubstance(baseJob));
});

test("hashJobSubstance: insensitive to property order in the input object", () => {
  const reordered = {
    description: baseJob.description,
    matchResult: baseJob.matchResult,
    terminologyMap: baseJob.terminologyMap,
    matchedAt: baseJob.matchedAt,
    id: baseJob.id,
  };
  assert.equal(hashJobSubstance(baseJob), hashJobSubstance(reordered));
});

test("hashJobSubstance: changes when matchResult JSON changes", () => {
  const updated = {
    ...baseJob,
    matchResult: JSON.stringify({ score: 90, breakdown: { gaps: [] } }),
  };
  assert.notEqual(hashJobSubstance(baseJob), hashJobSubstance(updated));
});

test("hashJobSubstance: changes when terminologyMap changes", () => {
  const updated = {
    ...baseJob,
    terminologyMap: JSON.stringify([{ jdTerm: "kube", resumeSynonyms: ["k8s"] }]),
  };
  assert.notEqual(hashJobSubstance(baseJob), hashJobSubstance(updated));
});

test("hashJobSubstance: changes when description changes", () => {
  const updated = { ...baseJob, description: "Different description text" };
  assert.notEqual(hashJobSubstance(baseJob), hashJobSubstance(updated));
});

test("hashJobSubstance: stable across matchedAt changes (timestamp is NOT part of substance)", () => {
  const sameSubstance = { ...baseJob, matchedAt: new Date("2026-05-15T00:00:00Z") };
  assert.equal(hashJobSubstance(baseJob), hashJobSubstance(sameSubstance));
});

test("hashJobSubstance: handles null matchResult, terminologyMap, description", () => {
  const sparse = {
    id: "job-x",
    matchedAt: null,
    matchResult: null,
    terminologyMap: null,
    description: null,
  };
  const out = hashJobSubstance(sparse);
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
  // Two sparse-but-equal jobs must hash equally
  assert.equal(out, hashJobSubstance({ ...sparse }));
});

test("hashJobSubstance: returns a 16-char hex digest", () => {
  const h = hashJobSubstance(baseJob);
  assert.match(h, /^[0-9a-f]{16}$/);
});
