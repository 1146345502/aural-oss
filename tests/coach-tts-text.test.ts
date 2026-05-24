import assert from "node:assert/strict";
import test from "node:test";

import {
    COACH_TTS_MAX_CHARS,
    prepareCoachTtsText,
    sanitizeTtsText,
} from "../src/lib/prep/coach-tts-text";

test("sanitizeTtsText normalizes curly quotes", () => {
  assert.equal(
    sanitizeTtsText("美妆BA所需的“深度沟通”能力"),
    '美妆BA所需的"深度沟通"能力',
  );
});

test("prepareCoachTtsText truncates long coach feedback", () => {
  const long = "专业且逻辑严密。".repeat(80);
  const out = prepareCoachTtsText(long);
  assert.ok(out.length <= COACH_TTS_MAX_CHARS);
});
