import assert from "node:assert/strict";
import test from "node:test";

import { isNonSubstantiveAnswer } from "../src/lib/prep/answer-quality";

test("does not classify substantive answers containing dynamic as mic checks", () => {
  const answer =
    "I believe that prioritizing open communication and brainstorming sessions is the most effective way to ensure collective success. In my experience, this creates a stronger team dynamic and helps everyone align on the goal.";

  assert.equal(isNonSubstantiveAnswer(answer), false);
});

test("still classifies actual audio or mic checks as non-substantive", () => {
  assert.equal(isNonSubstantiveAnswer("mic test"), true);
  assert.equal(isNonSubstantiveAnswer("microphone check"), true);
  assert.equal(isNonSubstantiveAnswer("can you hear me?"), true);
});
