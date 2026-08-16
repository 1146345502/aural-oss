import assert from "node:assert/strict";
import test from "node:test";

import {
    followUpDepthPromptCopy,
    followUpLimitNotice,
    followUpsSpentOnQuestion,
    shouldAllowTtsBargeIn,
    shouldSendFollowUpLimitNotice,
} from "../server/openai-voice-relay-helpers";
import { maxFollowUpsForDepth } from "../src/lib/follow-up-depth";

test("does not allow TTS barge-in before assistant audio has actually started", () => {
  assert.equal(
    shouldAllowTtsBargeIn({
      inEchoCooldown: true,
      modelIsSpeaking: true,
      responseAudioStarted: false,
      ttsAudioStartedAt: 0,
      nowMs: 1000,
      responseTtsBytes: 0,
      rms: 3000,
      thresholdRms: 2400,
      consecutiveFrames: 3,
      thresholdFrames: 3,
    }),
    false,
  );
});

test("does not allow TTS barge-in until enough assistant audio has been delivered", () => {
  assert.equal(
    shouldAllowTtsBargeIn({
      inEchoCooldown: true,
      modelIsSpeaking: true,
      responseAudioStarted: true,
      ttsAudioStartedAt: 900,
      nowMs: 1200,
      responseTtsBytes: 20_000,
      rms: 3000,
      thresholdRms: 2400,
      consecutiveFrames: 3,
      thresholdFrames: 3,
    }),
    false,
  );
});

test("allows TTS barge-in only after sustained strong speech once assistant audio is underway", () => {
  assert.equal(
    shouldAllowTtsBargeIn({
      inEchoCooldown: true,
      modelIsSpeaking: true,
      responseAudioStarted: true,
      ttsAudioStartedAt: 500,
      nowMs: 1100,
      responseTtsBytes: 48_000,
      rms: 3000,
      thresholdRms: 2400,
      consecutiveFrames: 3,
      thresholdFrames: 3,
    }),
    true,
  );
});

test("the scripted question itself does not count as a follow-up", () => {
  assert.equal(followUpsSpentOnQuestion(0), 0);
  assert.equal(followUpsSpentOnQuestion(1), 0);
  assert.equal(followUpsSpentOnQuestion(3), 2);
});

test("MODERATE budget notice fires only after the second follow-up is heard", () => {
  const followUpBudget = maxFollowUpsForDepth("MODERATE");
  assert.equal(followUpBudget, 2);

  const decide = (assistantTurnsThisQuestion: number) =>
    shouldSendFollowUpLimitNotice({
      assistantTurnsThisQuestion,
      followUpBudget,
      noticeAlreadySent: false,
      interviewDone: false,
    });

  assert.equal(decide(1), false, "asked the question, no follow-ups yet");
  assert.equal(decide(2), false, "one follow-up spent, one left");
  assert.equal(decide(3), true, "both follow-ups spent");
});

test("LIGHT tells the model to move on as soon as the question has been asked", () => {
  assert.equal(maxFollowUpsForDepth("LIGHT"), 0);
  assert.equal(
    shouldSendFollowUpLimitNotice({
      assistantTurnsThisQuestion: 1,
      followUpBudget: 0,
      noticeAlreadySent: false,
      interviewDone: false,
    }),
    true,
  );
});

test("the budget notice is sent once per question and never after the interview ends", () => {
  assert.equal(
    shouldSendFollowUpLimitNotice({
      assistantTurnsThisQuestion: 5,
      followUpBudget: 2,
      noticeAlreadySent: true,
      interviewDone: false,
    }),
    false,
  );
  assert.equal(
    shouldSendFollowUpLimitNotice({
      assistantTurnsThisQuestion: 5,
      followUpBudget: 2,
      noticeAlreadySent: false,
      interviewDone: true,
    }),
    false,
  );
});

test("depth prompt copy states the numeric budget in both languages", () => {
  const en = followUpDepthPromptCopy(2, false);
  assert.match(en.summary, /at most 2 follow-ups per question/);
  assert.match(en.rule, /at most 2 follow-ups/);
  assert.match(en.rule, /never exceed that limit/);

  const zh = followUpDepthPromptCopy(2, true);
  assert.match(zh.summary, /最多2次追问/);
  assert.match(zh.rule, /必须进入下一题/);
});

test("depth prompt copy singularizes a budget of one", () => {
  const { summary, rule } = followUpDepthPromptCopy(1, false);
  assert.match(summary, /at most 1 follow-up per question/);
  assert.doesNotMatch(summary, /follow-ups/);
  assert.match(rule, /at most 1 follow-up /);
});

test("a zero budget is phrased as no follow-ups rather than 'at most 0'", () => {
  const en = followUpDepthPromptCopy(0, false);
  assert.match(en.summary, /no follow-ups/);
  assert.doesNotMatch(en.summary, /0/);
  assert.match(en.rule, /uses no follow-ups/);
  assert.doesNotMatch(en.rule, /at most 0/);

  const zh = followUpDepthPromptCopy(0, true);
  assert.match(zh.summary, /不追问/);
  assert.match(zh.rule, /不使用追问/);
  assert.doesNotMatch(zh.rule, /最多0次/);
});

test("the depth rule is unnumbered so the prompt template owns its position", () => {
  for (const budget of [0, 1, 2, 5]) {
    for (const isZh of [true, false]) {
      assert.doesNotMatch(
        followUpDepthPromptCopy(budget, isZh).rule,
        /^\d+\.\s/,
        `budget=${budget} isZh=${isZh}`,
      );
    }
  }
});

test("the budget notice names the question and tells the model to transition", () => {
  const en = followUpLimitNotice(3, 2, false);
  assert.match(en, /question 3/);
  assert.match(en, /at most 2 follow-ups per question/);
  assert.match(en, /signal_question_change/);
  assert.match(en, /Do not ask another follow-up/);

  assert.match(followUpLimitNotice(1, 1, false), /at most 1 follow-up per/);

  const zh = followUpLimitNotice(3, 2, true);
  assert.match(zh, /第3题/);
  assert.match(zh, /signal_question_change/);
  assert.match(zh, /不要再追问/);
});
