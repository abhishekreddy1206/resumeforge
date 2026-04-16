import test from "node:test";
import assert from "node:assert/strict";
import flowUtilsModule from "./application-flow-utils.js";

const flowUtils = flowUtilsModule.default ?? flowUtilsModule;

test("matches same ATS flow across origin changes when company slug matches", () => {
  const flow = flowUtils.buildActiveApplicationState({
    jobId: "job_123",
    url: "https://job-boards.greenhouse.io/discord/jobs/123456",
    startedAt: 1_000,
  });

  assert.equal(
    flowUtils.matchesActiveApplicationFlow(
      flow,
      "https://boards.greenhouse.io/discord/application_confirmation",
      2_000
    ),
    true
  );
});

test("rejects active flows that are stale", () => {
  const flow = flowUtils.buildActiveApplicationState({
    jobId: "job_123",
    url: "https://jobs.lever.co/acme/abcdef",
    startedAt: 1_000,
  });

  assert.equal(
    flowUtils.matchesActiveApplicationFlow(
      flow,
      "https://jobs.lever.co/acme/confirmation",
      1_000 + flowUtils.MAX_ACTIVE_FLOW_AGE_MS + 1
    ),
    false
  );
});

test("requires recent submit intent before load-time confirmation checks", () => {
  const flow = flowUtils.buildActiveApplicationState({
    jobId: "job_123",
    url: "https://jobs.ashbyhq.com/ramp/abcdef",
    startedAt: 5_000,
    submitAttemptedAt: 7_000,
  });

  assert.equal(
    flowUtils.shouldAttemptLoadConfirmation(
      flow,
      "https://jobs.ashbyhq.com/ramp/thank-you",
      8_000
    ),
    true
  );

  assert.equal(
    flowUtils.shouldAttemptLoadConfirmation(
      flow,
      "https://jobs.ashbyhq.com/ramp/thank-you",
      7_000 + flowUtils.MAX_LOAD_CONFIRMATION_AGE_MS + 1
    ),
    false
  );
});

test("rejects a different company on the same ATS platform", () => {
  const flow = flowUtils.buildActiveApplicationState({
    jobId: "job_123",
    url: "https://jobs.lever.co/acme/abcdef",
    startedAt: 1_000,
    submitAttemptedAt: 2_000,
  });

  assert.equal(
    flowUtils.matchesActiveApplicationFlow(
      flow,
      "https://jobs.lever.co/other-company/confirmation",
      3_000
    ),
    false
  );
});

test("treats error responses as failed mark-applied attempts", () => {
  assert.equal(flowUtils.isSuccessfulMarkAppliedResponse({ id: "job_123", applied: true }), true);
  assert.equal(flowUtils.isSuccessfulMarkAppliedResponse({ error: "Failed to update job" }), false);
});
