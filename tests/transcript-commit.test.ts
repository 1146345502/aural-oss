import assert from "node:assert/strict";
import test from "node:test";

import { shouldCommitTranscript } from "@/lib/voice/transcript-commit";

test("commits interrupted assistant text when it has not been saved", () => {
  assert.equal(
    shouldCommitTranscript("", "Here is the first question: Tell me about latency."),
    true,
  );
});

test("skips duplicate assistant transcript commits", () => {
  assert.equal(
    shouldCommitTranscript(
      "Here is the first question: Tell me about latency.",
      " Here is the first question:   Tell me about latency. ",
    ),
    false,
  );
});

test("skips empty assistant transcript commits", () => {
  assert.equal(shouldCommitTranscript("previous", "  "), false);
});
