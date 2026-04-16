import test from "node:test";
import assert from "node:assert/strict";

import {
  extractLinkedInProfileUrl,
  normalizeLinkedInProfileUrl,
  shouldPersistLinkedInProfile,
} from "./linkedin-profile";

test("prefers the parsed linkedin URL when available", () => {
  assert.equal(
    extractLinkedInProfileUrl(
      "Profile text without a visible link",
      "https://www.linkedin.com/in/example-user/"
    ),
    "https://www.linkedin.com/in/example-user/"
  );
});

test("falls back to a linkedin URL present in pasted text", () => {
  assert.equal(
    extractLinkedInProfileUrl(
      "Reach me at linkedin.com/in/example-user/ for more details.",
      null
    ),
    "https://linkedin.com/in/example-user/"
  );
});

test("normalizes linkedin profile URLs and ignores non-profile links", () => {
  assert.equal(
    normalizeLinkedInProfileUrl("linkedin.com/in/example-user/),"),
    "https://linkedin.com/in/example-user/"
  );
  assert.equal(
    normalizeLinkedInProfileUrl("https://www.linkedin.com/company/openai"),
    null
  );
});

test("only persists linkedin when no canonical value is already stored", () => {
  assert.equal(
    shouldPersistLinkedInProfile(
      "",
      "https://www.linkedin.com/in/example-user/"
    ),
    true
  );
  assert.equal(
    shouldPersistLinkedInProfile(
      "https://www.linkedin.com/in/existing-profile/",
      "https://www.linkedin.com/in/new-profile/"
    ),
    false
  );
});
