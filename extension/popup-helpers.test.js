import test from "node:test";
import assert from "node:assert/strict";
import popupHelpersModule from "./popup-helpers.js";

const {
  classifyCaptureDuplicate,
  buildDuplicateReviewUrl,
} = popupHelpersModule.default ?? popupHelpersModule;

test("classifies duplicate capture payloads by kind", () => {
  assert.equal(
    classifyCaptureDuplicate({ duplicateKind: "saved-source" }, "article"),
    "saved-source"
  );
  assert.equal(
    classifyCaptureDuplicate({ duplicateKind: "job" }, "job"),
    "job"
  );
  assert.equal(
    classifyCaptureDuplicate({}, "job"),
    "job"
  );
});

test("builds review URLs for saved sources and jobs", () => {
  assert.equal(
    buildDuplicateReviewUrl("http://localhost:3000", { existingSourceId: "src_1" }, "article"),
    "http://localhost:3000/learn/sources/src_1"
  );
  assert.equal(
    buildDuplicateReviewUrl("http://localhost:3000", { existingJobId: "job_1" }, "job"),
    "http://localhost:3000/jobs?jobId=job_1"
  );
});
