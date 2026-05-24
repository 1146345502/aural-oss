import assert from "node:assert/strict";
import test from "node:test";

import { isAbortError } from "../src/lib/abort-error";

test("isAbortError detects DOMException AbortError", () => {
  assert.equal(
    isAbortError(new DOMException("Aborted", "AbortError")),
    true,
  );
});

test("isAbortError detects Error with AbortError name", () => {
  const err = new Error("The user aborted a request.");
  err.name = "AbortError";
  assert.equal(isAbortError(err), true);
});

test("isAbortError detects BodyStreamBuffer abort message", () => {
  assert.equal(isAbortError(new Error("BodyStreamBuffer was aborted")), true);
});

test("isAbortError returns false for other errors", () => {
  assert.equal(isAbortError(new Error("Network failed")), false);
});
