import test from "node:test";
import assert from "node:assert/strict";
import { computeRejectionUpdate } from "@/lib/job-rejection";

test("rejecting with a missing reason → ok:false, 400", () => {
  const result = computeRejectionUpdate({
    rejected: true,
    reason: undefined,
    currentlyRejected: false,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /reason is required/i);
  }
});

test("rejecting with an unknown reason → ok:false, 400", () => {
  const result = computeRejectionUpdate({
    rejected: true,
    reason: "not_a_real_reason",
    currentlyRejected: false,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /invalid rejection reason/i);
  }
});

test("rejecting a not-yet-rejected job → ok:true, fresh rejection (preserveTimestamp false)", () => {
  const result = computeRejectionUpdate({
    rejected: true,
    reason: "salary_mismatch",
    currentlyRejected: false,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.rejected, true);
    if (result.data.rejected) {
      assert.equal(result.data.reason, "salary_mismatch");
      assert.equal(result.data.preserveTimestamp, false);
    }
  }
});

test("editing the reason on an already-rejected job → ok:true, preserveTimestamp true", () => {
  const result = computeRejectionUpdate({
    rejected: true,
    reason: "ghosted",
    currentlyRejected: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.rejected, true);
    if (result.data.rejected) {
      assert.equal(result.data.reason, "ghosted");
      assert.equal(result.data.preserveTimestamp, true);
    }
  }
});

test("clearing a rejection → ok:true, rejected false, reason ignored", () => {
  const result = computeRejectionUpdate({
    rejected: false,
    reason: "salary_mismatch", // should be ignored
    currentlyRejected: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.rejected, false);
  }
});

test("clearing with no reason at all → ok:true, rejected false", () => {
  const result = computeRejectionUpdate({
    rejected: false,
    reason: undefined,
    currentlyRejected: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.rejected, false);
  }
});
