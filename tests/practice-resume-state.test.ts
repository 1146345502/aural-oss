import assert from "node:assert/strict";
import test from "node:test";

import type { PrepAttempt, PrepQuestion } from "../src/components/prep/prep-types";
import { buildPracticeResumeState } from "../src/lib/prep/practice-resume-state";

const questions: PrepQuestion[] = [
  {
    id: "q1",
    interviewId: "i1",
    order: 0,
    text: "Tell me about yourself.",
    description: null,
    type: "OPEN_ENDED",
  },
  {
    id: "q2",
    interviewId: "i1",
    order: 1,
    text: "Why this role?",
    description: null,
    type: "OPEN_ENDED",
  },
];

function makeAttempt(
  partial: Partial<PrepAttempt> & Pick<PrepAttempt, "id" | "questionId">,
): PrepAttempt {
  return {
    id: partial.id,
    sessionId: "s1",
    interviewId: "i1",
    questionId: partial.questionId,
    userId: "u1",
    answerText: partial.answerText ?? "Sample answer text here.",
    inputMode: partial.inputMode ?? "VOICE",
    durationSeconds: partial.durationSeconds ?? 30,
    feedback: partial.feedback ?? {
      score: 7,
      verdict: "Solid start",
      summary: "Good structure.",
      strengths: ["Clear"],
      improvements: ["Add metrics"],
      missingSignals: [],
      resumeLeverage: [],
      structureSuggestion: "",
      followUpQuestion: "",
      sampleAnswer: "",
      needsUserVerification: [],
    },
    followUp: [],
    score: partial.score ?? 7,
    attemptNumber: partial.attemptNumber ?? 1,
    createdAt: partial.createdAt ?? "2026-05-20T10:00:00.000Z",
    audioUrl: partial.audioUrl ?? null,
    audioDurationSeconds: partial.audioDurationSeconds ?? null,
  };
}

test("buildPracticeResumeState returns null when there are no attempts", () => {
  assert.equal(buildPracticeResumeState(questions, []), null);
});

test("buildPracticeResumeState rebuilds a single answered question", () => {
  const state = buildPracticeResumeState(questions, [
    makeAttempt({
      id: "a1",
      questionId: "q1",
      audioUrl: "https://example.com/audio.webm",
      audioDurationSeconds: 12,
      durationSeconds: 34,
    }),
  ]);

  assert.ok(state);
  assert.equal(state.messages.length, 3);
  const answer = state.messages.find((message) => message.kind === "answer");
  assert.equal(answer && answer.kind === "answer" ? answer.audioUrl : null, "https://example.com/audio.webm");
  assert.equal(answer && answer.kind === "answer" ? answer.audioDurationMs : null, 12000);
  assert.equal(state.questionIndex, 0);
  assert.equal(state.awaitingRetry, true);
  assert.equal(state.activePrompt.questionId, "q1");
  assert.equal(state.pinnedMessageId, "feedback-a1");
});

test("buildPracticeResumeState includes retries on the same question", () => {
  const state = buildPracticeResumeState(questions, [
    makeAttempt({
      id: "a1",
      questionId: "q1",
      createdAt: "2026-05-20T10:00:00.000Z",
    }),
    makeAttempt({
      id: "a2",
      questionId: "q1",
      createdAt: "2026-05-20T10:05:00.000Z",
      answerText: "Revised answer with more detail.",
    }),
  ]);

  assert.ok(state);
  assert.equal(state.messages.length, 5);
  assert.equal(state.pinnedMessageId, "feedback-a2");
});

test("buildPracticeResumeState resumes on the latest attempted question", () => {
  const state = buildPracticeResumeState(questions, [
    makeAttempt({
      id: "a1",
      questionId: "q1",
      createdAt: "2026-05-20T10:00:00.000Z",
    }),
    makeAttempt({
      id: "a2",
      questionId: "q2",
      createdAt: "2026-05-20T10:10:00.000Z",
    }),
  ]);

  assert.ok(state);
  assert.equal(state.questionIndex, 1);
  assert.equal(state.activePrompt.questionId, "q2");
  assert.equal(
    state.messages.filter((message) => message.kind === "question").length,
    2,
  );
});
