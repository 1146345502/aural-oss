import assert from "node:assert/strict";
import test from "node:test";

import {
  getSessionOverallScore,
  usesQuestionEvaluationScore,
} from "../src/lib/session-score";

test("getSessionOverallScore prefers question-by-question evaluations", () => {
  const insights = {
    questionEvaluations: [{ score: 8 }, { score: 6 }],
    criteriaEvaluations: [{ score: 10 }, { score: 10 }],
  };

  assert.equal(getSessionOverallScore(insights), 7);
  assert.equal(usesQuestionEvaluationScore(insights), true);
});

test("getSessionOverallScore falls back to criteria for legacy sessions", () => {
  const insights = {
    criteriaEvaluations: [{ score: 9 }, { score: 7 }],
  };

  assert.equal(getSessionOverallScore(insights), 8);
  assert.equal(usesQuestionEvaluationScore(insights), false);
});

test("getSessionOverallScore parses numeric strings and ignores invalid values", () => {
  const insights = {
    questionEvaluations: [
      { score: "9.5" },
      { score: "invalid" },
      { score: null },
    ],
    criteriaEvaluations: [{ score: 2 }],
  };

  assert.equal(getSessionOverallScore(insights), 9.5);
  assert.equal(usesQuestionEvaluationScore(insights), true);
});

test("getSessionOverallScore returns null when no valid scores exist", () => {
  const insights = {
    questionEvaluations: [{ score: null }, { score: "NaN" }],
    criteriaEvaluations: [],
  };

  assert.equal(getSessionOverallScore(insights), null);
  assert.equal(usesQuestionEvaluationScore(insights), false);
});
