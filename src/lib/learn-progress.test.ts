import test from "node:test";
import assert from "node:assert/strict";
import type { GuideSection } from "@/lib/claude/skills/guide-generator";
import { getGuideProgressPercent, getSectionStatus } from "@/lib/learn-progress";

function section(id: string, opts: { quizzes?: number; scenarios?: number } = {}): GuideSection {
  const quizzes = opts.quizzes ?? 0;
  const scenarios = opts.scenarios ?? 0;
  return {
    id,
    title: id,
    explanation: "",
    codeExamples: [],
    knowledgeChecks: Array.from({ length: quizzes }, (_, i) => ({
      type: "quiz" as const,
      question: `q${i}`,
      options: ["a", "b"],
      answer: 0,
      explanation: "",
    })),
    interviewScenarios: Array.from({ length: scenarios }, (_, i) => ({
      setup: `s${i}`,
      hints: [],
      sampleAnswer: "",
    })),
    keyTakeaways: [],
  };
}

test("getGuideProgressPercent: empty sections list → 0", () => {
  assert.equal(getGuideProgressPercent([], {}), 0);
});

test("getGuideProgressPercent: sections with no quizzes/scenarios are auto-completed → 100", () => {
  const sections = [section("a"), section("b"), section("c")];
  assert.equal(getGuideProgressPercent(sections, {}), 100);
});

test("getGuideProgressPercent: 1 of 4 sections fully done → 25", () => {
  const sections = [
    section("a", { quizzes: 2, scenarios: 1 }),
    section("b", { quizzes: 2 }),
    section("c", { scenarios: 1 }),
    section("d", { quizzes: 1 }),
  ];
  const progress = {
    a: { quizzesCompleted: [0, 1], scenariosRevealed: [0] },
  };
  assert.equal(getGuideProgressPercent(sections, progress), 25);
});

test("getGuideProgressPercent: partial progress on a section is in_progress, not counted as done", () => {
  const sections = [
    section("a", { quizzes: 3 }),
    section("b", { quizzes: 2 }),
  ];
  const progress = {
    a: { quizzesCompleted: [0], scenariosRevealed: [] },
  };
  assert.equal(getSectionStatus(sections[0], progress), "in_progress");
  assert.equal(getGuideProgressPercent(sections, progress), 0);
});

test("getGuideProgressPercent: rounds to nearest integer (1 of 3 → 33)", () => {
  const sections = [
    section("a", { quizzes: 1 }),
    section("b", { quizzes: 1 }),
    section("c", { quizzes: 1 }),
  ];
  const progress = {
    a: { quizzesCompleted: [0], scenariosRevealed: [] },
  };
  assert.equal(getGuideProgressPercent(sections, progress), 33);
});

test("getSectionStatus: scenarios fully revealed alongside completed quizzes → completed", () => {
  const s = section("a", { quizzes: 2, scenarios: 2 });
  const status = getSectionStatus(s, { a: { quizzesCompleted: [0, 1], scenariosRevealed: [0, 1] } });
  assert.equal(status, "completed");
});

test("getSectionStatus: missing progress entry on a section with checks → not_started", () => {
  const s = section("a", { quizzes: 1 });
  assert.equal(getSectionStatus(s, {}), "not_started");
});

test("getSectionStatus: generation status overrides user progress", () => {
  const s = section("a", { quizzes: 1 });
  const progress = { a: { quizzesCompleted: [0], scenariosRevealed: [] } };
  assert.equal(getSectionStatus(s, progress, { a: "generating" }), "not_started");
  assert.equal(getSectionStatus(s, progress, { a: "generating_interactive" }), "in_progress");
});
