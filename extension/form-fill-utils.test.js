import test from "node:test";
import assert from "node:assert/strict";
import formFillUtilsModule from "./form-fill-utils.js";

const {
  classifyRequiredField,
  isFillableHiddenFileInput,
} = formFillUtilsModule.default ?? formFillUtilsModule;

test("classifies required extension fields consistently", () => {
  assert.equal(classifyRequiredField("LinkedIn Profile"), "deterministic_profile");
  assert.equal(classifyRequiredField("Country/Region"), "deterministic_profile");
  assert.equal(classifyRequiredField("Veteran Status"), "sensitive_demographic");
  assert.equal(
    classifyRequiredField("Are you currently subject to any non-compete agreement?"),
    "general_screening"
  );
});

test("allows hidden file inputs when attached to a visible upload wrapper", () => {
  const wrapper = { visible: true };
  const input = {
    type: "file",
    disabled: false,
    readOnly: false,
    labels: [],
    closest(selector) {
      if (selector.includes(".file-upload")) return wrapper;
      return null;
    },
  };

  assert.equal(
    isFillableHiddenFileInput(input, (el) => Boolean(el.visible)),
    true
  );
});

test("rejects hidden file inputs without visible affordances", () => {
  const input = {
    type: "file",
    disabled: false,
    readOnly: false,
    labels: [],
    closest() {
      return null;
    },
  };

  assert.equal(isFillableHiddenFileInput(input, () => false), false);
});
