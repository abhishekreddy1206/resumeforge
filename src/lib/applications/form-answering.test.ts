import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyFormQuestion,
  getExplicitAnswerForQuestion,
  matchAnswerToOptionOrNull,
} from "./form-answering";

test("classifies demographic questions as sensitive", () => {
  assert.equal(
    classifyFormQuestion("Veteran Status:"),
    "sensitive_demographic"
  );
  assert.equal(
    classifyFormQuestion("I identify my gender as:"),
    "sensitive_demographic"
  );
});

test("classifies country and linkedin questions as deterministic", () => {
  assert.equal(
    classifyFormQuestion("Country/Region"),
    "deterministic_profile"
  );
  assert.equal(
    classifyFormQuestion("LinkedIn Profile"),
    "deterministic_profile"
  );
});

test("resolves explicit country and preferred first name from application profile context", () => {
  const ctx = {
    firstName: "Abhishek",
    preferredFirstName: "Abhi",
    country: "United States",
  };

  assert.equal(
    getExplicitAnswerForQuestion("Preferred First Name", ctx),
    "Abhi"
  );
  assert.equal(
    getExplicitAnswerForQuestion("Country/Region", ctx),
    "United States"
  );
});

test("maps canonical demographic values to real option labels", () => {
  assert.equal(
    matchAnswerToOptionOrNull("male", ["Woman", "Man", "I don't wish to answer"]),
    "Man"
  );
  assert.equal(
    matchAnswerToOptionOrNull("prefer_not_to_say", ["Woman", "I don't wish to answer"]),
    "I don't wish to answer"
  );
});

test("returns null when no option can be matched", () => {
  assert.equal(
    matchAnswerToOptionOrNull("United States", ["Canada", "Mexico"]),
    null
  );
});
