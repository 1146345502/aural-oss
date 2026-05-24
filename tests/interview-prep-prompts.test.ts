import assert from "node:assert/strict";
import test from "node:test";

import {
    buildPrepFeedbackPrompt,
    buildPrepFollowUpPrompt,
    buildPrepHintPrompt,
} from "../src/lib/ai/prompts/prep";

const baseInterview = {
  title: "Frontend interview",
  roleTitle: "Senior Frontend Engineer",
  companyName: "Aural",
  jobDescription: "Own React architecture, accessibility, and product quality.",
  resumeText: "Built React design systems and improved checkout performance.",
  language: "en",
};

const baseQuestion = {
  text: "Tell me about a frontend architecture decision.",
  description: "Probe tradeoffs and rollout strategy.",
  type: "OPEN_ENDED",
};

test("hint prompt grounds suggested answer in resume and JD", () => {
  const messages = buildPrepHintPrompt({
    interview: baseInterview,
    question: baseQuestion,
  });
  const system = String(messages[0].content);
  const user = String(messages[1].content);

  assert.match(system, /polished sample answer/i);
  assert.match(system, /never invent/i);
  assert.match(system, /PLAIN TEXT only/);
  assert.match(user, /Own React architecture/);
  assert.match(user, /Built React design systems/);
  assert.match(user, /Tell me about a frontend architecture decision\./);
});

test("feedback prompt omits voiceDelivery JSON when no audio or metrics", () => {
  const messages = buildPrepFeedbackPrompt({
    interview: baseInterview,
    question: baseQuestion,
    answerText: "I led a rollout with clear metrics.",
    practiceMode: true,
  });

  const system = String(messages[0].content);
  assert.doesNotMatch(system, /"voiceDelivery":/);
  assert.match(system, /TEXT ONLY/i);
  assert.match(system, /Do NOT output voiceDelivery/i);
});

test("feedback prompt attaches audio parts when answer audio is provided", () => {
  const messages = buildPrepFeedbackPrompt({
    interview: baseInterview,
    question: baseQuestion,
    answerText: "I led a rollout with clear metrics.",
    practiceMode: true,
    answerAudio: { mimeType: "audio/webm", base64: "dGVzdA==" },
  });

  const system = String(messages[0].content);
  const user = messages[1].content;
  assert.match(system, /audio recording of the candidate/i);
  assert.ok(Array.isArray(user));
  const parts = user as { type: string }[];
  assert.equal(parts.length, 2);
  assert.equal(parts[0].type, "text");
  assert.equal(parts[1].type, "inline_audio");
});

test("feedback prompt includes prior attempts and JSON schema", () => {
  const messages = buildPrepFeedbackPrompt({
    interview: baseInterview,
    question: baseQuestion,
    answerText: "I led a component refactor and coordinated rollout.",
    previousAttempts: [
      {
        answerText: "I worked on components.",
        score: 5,
        feedbackSummary: "Needs more specificity.",
      },
    ],
  });

  const system = String(messages[0].content);
  const user = String(messages[1].content);

  assert.match(system, /sampleAnswer/);
  assert.match(system, /needsUserVerification/);
  assert.match(system, /Derive expected signals yourself/);
  assert.match(user, /Attempt 1: score=5/);
  assert.match(user, /I led a component refactor/);
  assert.doesNotMatch(system, /expectedSignals/);
});

test("feedback prompt handles missing JD/resume without crashing", () => {
  const messages = buildPrepFeedbackPrompt({
    interview: { ...baseInterview, jobDescription: null, resumeText: null },
    question: baseQuestion,
    answerText: "Some answer.",
  });
  const user = String(messages[1].content);
  assert.match(user, /\(none provided\)/);
});

test("follow-up prompt asks for next probe when turns remain", () => {
  const messages = buildPrepFollowUpPrompt({
    interview: baseInterview,
    question: baseQuestion,
    initialAnswer: "I refactored the design system",
    initialFeedbackSummary: "Solid, but quantify impact.",
    priorTurns: [
      {
        prompt: "What did week 3 specifically change?",
        answer: "We moved tokens into a shared package.",
      },
    ],
    remainingTurns: 2,
  });

  const system = String(messages[0].content);
  const user = String(messages[1].content);

  assert.match(system, /shouldContinue/);
  assert.match(system, /Produce the NEXT realistic interviewer follow-up/);
  assert.match(user, /Follow-up 1/);
  assert.match(user, /Remaining follow-up turns after this one: 2/);
});

test("follow-up prompt gives final refinement when no turns remain", () => {
  const messages = buildPrepFollowUpPrompt({
    interview: baseInterview,
    question: baseQuestion,
    initialAnswer: "Initial",
    initialFeedbackSummary: "Initial summary",
    priorTurns: [],
    remainingTurns: 0,
  });

  const system = String(messages[0].content);
  assert.match(system, /FINAL follow-up turn/);
  assert.match(system, /shouldContinue/);
});
