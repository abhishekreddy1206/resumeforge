import test from "node:test";
import assert from "node:assert/strict";
import {
  TAXONOMY_VERSION,
  ROLE_CATEGORIES,
  getCategoryById,
  getActiveCategories,
} from "./role-taxonomy";

test("taxonomy has a version string", () => {
  assert.match(TAXONOMY_VERSION, /^\d{4}-\d{2}$/);
});

test("taxonomy contains at least 18 entries including 'other'", () => {
  assert.ok(ROLE_CATEGORIES.length >= 18);
  assert.ok(ROLE_CATEGORIES.some((c) => c.id === "other"));
});

test("all category IDs are unique, kebab-case, and non-empty", () => {
  const ids = ROLE_CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z][a-z0-9-]+$/, `bad id: ${id}`);
  }
});

test("every category has at least 3 hotTopics and 3 signalKeywords", () => {
  for (const cat of ROLE_CATEGORIES) {
    if (cat.id === "other") continue;
    assert.ok(cat.hotTopics.length >= 3, `${cat.id} missing hotTopics`);
    assert.ok(cat.signalKeywords.length >= 3, `${cat.id} missing signalKeywords`);
  }
});

test("every hotTopic has stable id, title, description, skillKeywords", () => {
  for (const cat of ROLE_CATEGORIES) {
    for (const t of cat.hotTopics) {
      assert.match(t.id, /^[a-z][a-z0-9-]+$/);
      assert.ok(t.title.length > 0);
      assert.ok(t.description.length > 0);
      assert.ok(t.skillKeywords.length > 0);
      assert.ok(["beginner", "intermediate", "advanced"].includes(t.difficulty));
    }
  }
});

test("getCategoryById returns the category or undefined", () => {
  assert.equal(getCategoryById("ai-engineering")?.id, "ai-engineering");
  assert.equal(getCategoryById("does-not-exist"), undefined);
});

test("getActiveCategories filters out deprecated entries", () => {
  const active = getActiveCategories();
  for (const cat of active) {
    assert.equal(cat.status, "active");
  }
});
