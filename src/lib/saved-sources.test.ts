import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateManualSavedSourceEdit,
  reviewSavedSourceContent,
  stringifyReviewFlags,
} from "@/lib/saved-sources";

test("manual saved-source edits no-op when content is unchanged after normalization", () => {
  const currentReview = reviewSavedSourceContent("Distributed Systems", "Raft consensus explained", "scraped");
  const result = evaluateManualSavedSourceEdit(
    {
      title: "Distributed Systems",
      contentHash: currentReview.contentHash,
      wordCount: currentReview.wordCount,
      reviewFlags: stringifyReviewFlags(currentReview.reviewFlags),
      reviewSummary: currentReview.reviewSummary,
      captureMethod: "scraped",
    },
    {
      title: "Distributed Systems",
      content: "  Raft   consensus explained  ",
    }
  );

  assert.equal(result.unchanged, true);
});

test("manual saved-source edits create a material change when content changes", () => {
  const currentReview = reviewSavedSourceContent("Distributed Systems", "Raft consensus explained", "scraped");
  const result = evaluateManualSavedSourceEdit(
    {
      title: "Distributed Systems",
      contentHash: currentReview.contentHash,
      wordCount: currentReview.wordCount,
      reviewFlags: stringifyReviewFlags(currentReview.reviewFlags),
      reviewSummary: currentReview.reviewSummary,
      captureMethod: "scraped",
    },
    {
      title: "Distributed Systems",
      content: "Raft consensus explained with log replication details and quorum flow",
    }
  );

  assert.equal(result.unchanged, false);
  assert.notEqual(result.review.contentHash, currentReview.contentHash);
  assert.ok(result.review.wordCount > currentReview.wordCount);
});
