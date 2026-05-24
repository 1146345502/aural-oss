import assert from "node:assert/strict";
import test from "node:test";

import {
    hasPartialFeedbackHeader,
    parsePartialPrepFeedback,
} from "../src/lib/prep/parse-partial-feedback-json";

test("parsePartialPrepFeedback returns null before JSON starts", () => {
  assert.equal(parsePartialPrepFeedback("Reading"), null);
});

test("parsePartialPrepFeedback ignores raw model score during stream", () => {
  assert.deepEqual(parsePartialPrepFeedback('{"score": 7, "verdict": "Good"'), {
    verdict: "Good",
  });
});

test("parsePartialPrepFeedback extracts verdict once the string closes", () => {
  assert.equal(parsePartialPrepFeedback('{"score": 6, "verdict": "Solid start'), null);
  assert.deepEqual(
    parsePartialPrepFeedback('{"score": 6, "verdict": "Solid start", "summary":'),
    { verdict: "Solid start" },
  );
});

test("parsePartialPrepFeedback streams partial summary text", () => {
  const raw =
    '{"score": 8, "verdict": "Strong answer", "summary": "You anchored the story in metrics and';
  assert.deepEqual(parsePartialPrepFeedback(raw), {
    verdict: "Strong answer",
    summary: "You anchored the story in metrics and",
  });
});

test("parsePartialPrepFeedback parses completed string arrays", () => {
  const raw = `{
      "score": 7,
      "verdict": "Good",
      "summary": "Nice work.",
      "strengths": ["Clear structure", "Specific metrics"],
      "improvements": ["Add trade-offs"]
    }`;
  assert.deepEqual(parsePartialPrepFeedback(raw), {
    verdict: "Good",
    summary: "Nice work.",
    strengths: ["Clear structure", "Specific metrics"],
    improvements: ["Add trade-offs"],
  });
});

test("parsePartialPrepFeedback decodes escaped characters in strings", () => {
  const raw =
    '{"verdict": "Needs work", "summary": "Try \\"STAR\\" with one metric."}';
  assert.deepEqual(parsePartialPrepFeedback(raw), {
    verdict: "Needs work",
    summary: 'Try "STAR" with one metric.',
  });
});

test("hasPartialFeedbackHeader detects renderable header fields", () => {
  assert.equal(
    hasPartialFeedbackHeader({ score: 7, verdict: "Good", summary: "" }),
    true,
  );
  assert.equal(hasPartialFeedbackHeader({ score: 7, verdict: "", summary: "" }), false);
});
