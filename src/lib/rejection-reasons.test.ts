import test from "node:test";
import assert from "node:assert/strict";
import {
  REJECTION_REASONS,
  isRejectionReasonKey,
  labelForReason,
} from "@/lib/rejection-reasons";

test("REJECTION_REASONS exports exactly the 10 spec'd keys in stable order", () => {
  const keys = REJECTION_REASONS.map((r) => r.key);
  assert.deepEqual(keys, [
    "role_filled",
    "underqualified",
    "salary_mismatch",
    "location",
    "visa",
    "failed_technical",
    "failed_behavioral",
    "ghosted",
    "withdrew",
    "other",
  ]);
});

test("REJECTION_REASONS each entry has non-empty label", () => {
  for (const r of REJECTION_REASONS) {
    assert.equal(typeof r.label, "string");
    assert.ok(r.label.length > 0, `empty label for key ${r.key}`);
  }
});

test("isRejectionReasonKey: every shipped key passes", () => {
  for (const r of REJECTION_REASONS) {
    assert.equal(isRejectionReasonKey(r.key), true, `key ${r.key} should be valid`);
  }
});

test("isRejectionReasonKey: rejects unknown strings", () => {
  assert.equal(isRejectionReasonKey("not_a_real_reason"), false);
  assert.equal(isRejectionReasonKey(""), false);
  assert.equal(isRejectionReasonKey("OTHER"), false); // case-sensitive
});

test("isRejectionReasonKey: rejects non-strings", () => {
  assert.equal(isRejectionReasonKey(null), false);
  assert.equal(isRejectionReasonKey(undefined), false);
  assert.equal(isRejectionReasonKey(42), false);
  assert.equal(isRejectionReasonKey({}), false);
});

test("labelForReason: returns the matching label for a known key", () => {
  assert.equal(labelForReason("salary_mismatch"), "Salary mismatch");
  assert.equal(labelForReason("ghosted"), "Ghosted");
});

test("labelForReason: returns 'Unspecified' for null and undefined", () => {
  assert.equal(labelForReason(null), "Unspecified");
  assert.equal(labelForReason(undefined), "Unspecified");
});
