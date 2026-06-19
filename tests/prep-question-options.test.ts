import assert from "node:assert/strict";
import test from "node:test";

import { normalizePrepQuestionOptions } from "../src/components/prep/prep-types";

test("normalizes generated choice options from an options object", () => {
  assert.deepEqual(
    normalizePrepQuestionOptions({
      options: ["Align early", "Debate openly", "Escalate quickly"],
      allowMultiple: false,
    }),
    [
      { label: "Align early" },
      { label: "Debate openly" },
      { label: "Escalate quickly" },
    ],
  );
});

test("normalizes template choice options from label/value objects", () => {
  assert.deepEqual(
    normalizePrepQuestionOptions([
      { label: "Regular 1-on-1 meetings", value: "regular_1on1" },
      { label: "Real-time, in the moment", value: "realtime" },
    ]),
    [
      { label: "Regular 1-on-1 meetings", value: "regular_1on1" },
      { label: "Real-time, in the moment", value: "realtime" },
    ],
  );
});
