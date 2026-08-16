import assert from "node:assert/strict";
import test from "node:test";

import { PROMPTS, type ResponsePromptParams } from "../server/voice-relay-prompts";

function basePromptParams(overrides: Partial<ResponsePromptParams> = {}): ResponsePromptParams {
  return {
    aiName: "美妆HR助手",
    title: "美妆品牌BA销售与沟通能力面试",
    qNum: 1,
    totalQs: 8,
    qText: "你认为自己在美妆BA工作中最大的优势是什么？",
    qType: "TEXT",
    choiceInstruction: "",
    history: "美妆HR助手: 你认为自己在美妆BA工作中最大的优势是什么？\n受访者: 我刚不是讲了我这几个这么多的优势吗？你为什么还问我？",
    followUpInstruction: "你还可以追问最多2次。",
    nextToken: "[NEXT]",
    prevToken: "[PREV]",
    userTurns: 2,
    ...overrides,
  };
}

test("normal response prompt carries recent interviewer context and repetition recovery guidance", () => {
  const prompt = PROMPTS.response.normal(basePromptParams({
    recentInterviewerResponses: [
      "非常感谢你的分享。那么，你认为自己在美妆BA工作中最大的优势是什么？",
      "杨钰珊，你的热情和经验确实很吸引人。那么，你认为自己在美妆BA工作中最大的优势是什么？",
    ],
  })).zh;

  assert.match(prompt, /最近你已经说过或问过/);
  assert.match(prompt, /不要复述或重问/);
  assert.match(prompt, /如果受访者指出你重复提问/);
  assert.match(prompt, /最大的优势是什么/);
});

test("normal response prompt marks the latest interviewer prompt as answered", () => {
  const prompt = PROMPTS.response.normal(basePromptParams({
    qText: "你觉得自己在美妆行业的优势和特点是什么呢？",
    history: "美妆HR助手: 好的，谢谢你的分享。那么，你觉得自己在美妆行业的优势和特点是什么呢？\n受访者: 我的优势是我非常的懂沟通，然后懂客户的痛点，可以很好的转化消费者。",
    latestInterviewerPrompt: "好的，谢谢你的分享。那么，你觉得自己在美妆行业的优势和特点是什么呢？",
    latestParticipantAnswer: "我的优势是我非常的懂沟通，然后懂客户的痛点，可以很好的转化消费者。",
  })).zh;

  assert.match(prompt, /你刚刚问过/);
  assert.match(prompt, /受访者最新发言/);
  assert.match(prompt, /受访者已经回答过原题/);
  assert.match(prompt, /不要再重问同一个问题/);
});

test("the last question tells the interviewer nothing follows it", () => {
  // Q5 of 5 used to close with "let's move forward to the next part of our
  // discussion", promising a question that does not exist.
  const prompt = PROMPTS.response.normal(basePromptParams({
    qNum: 5,
    totalQs: 5,
    isLastQuestion: true,
  })).en;

  assert.match(prompt, /FINAL question \(5 of 5\)/);
  assert.match(prompt, /nothing follows it/);
  assert.match(prompt, /next part of our discussion/);
  assert.match(prompt, /there is no next question/);
  // The relay speaks its own wrap-up and farewell after the question closes.
  assert.match(prompt, /do NOT say the full goodbye yourself/);
});

test("mid-interview questions carry no last-question notice", () => {
  const prompt = PROMPTS.response.normal(basePromptParams({
    qNum: 2,
    totalQs: 5,
    isLastQuestion: false,
  })).en;

  assert.doesNotMatch(prompt, /FINAL question/);
  assert.doesNotMatch(prompt, /nothing follows it/);
});

test("an unspecified position is treated as mid-interview", () => {
  const prompt = PROMPTS.response.normal(basePromptParams()).en;
  assert.doesNotMatch(prompt, /FINAL question/);
});

test("the last-question notice reaches coding and whiteboard questions too", () => {
  const prompt = PROMPTS.response.codingWb(basePromptParams({
    qNum: 3,
    totalQs: 3,
    qType: "CODING",
    isLastQuestion: true,
  })).en;

  assert.match(prompt, /FINAL question \(3 of 3\)/);
  assert.match(prompt, /there is no next question/);
});

test("the Chinese last-question notice bans the same transition phrasing", () => {
  const prompt = PROMPTS.response.normal(basePromptParams({
    qNum: 5,
    totalQs: 5,
    isLastQuestion: true,
  })).zh;

  assert.match(prompt, /这是最后一道题（第5题，共5题）/);
  assert.match(prompt, /进入下一个问题/);
  assert.match(prompt, /没有下一题了/);
});

test("follow-up budget lines stop implying a next question on the last one", () => {
  const lastQ = { isLastQuestion: true };
  const midQ = { isLastQuestion: false };

  for (const instruction of [
    PROMPTS.followUp.oneLeft("[NEXT]", lastQ),
    PROMPTS.followUp.remaining(2, "[NEXT]", lastQ),
  ]) {
    assert.match(instruction.en, /this is the last question/i);
    assert.match(instruction.en, /not say you are moving on to the next question/);
    assert.match(instruction.zh, /最后一道题/);
  }

  for (const instruction of [
    PROMPTS.followUp.oneLeft("[NEXT]", midQ),
    PROMPTS.followUp.remaining(2, "[NEXT]", midQ),
  ]) {
    assert.doesNotMatch(instruction.en, /last question/i);
    assert.doesNotMatch(instruction.zh, /最后一道题/);
  }
});

test("skipping the last question does not announce a next question", () => {
  const lastQ = PROMPTS.followUp.skipOverride("[NEXT]", { isLastQuestion: true });
  assert.match(lastQ.en, /LAST question/);
  assert.match(lastQ.en, /Do NOT say you are moving to the next question/);
  assert.match(lastQ.en, /do NOT deliver the full goodbye yourself/);
  assert.match(lastQ.zh, /不要说"进入下一题"/);

  const midQ = PROMPTS.followUp.skipOverride("[NEXT]", { isLastQuestion: false });
  assert.match(midQ.en, /move on to the next question/);
  assert.doesNotMatch(midQ.en, /LAST question/);
});

test("awaitingAnswer keeps the interviewer on the question until it is actually answered", () => {
  const zh = PROMPTS.followUp.awaitingAnswer("[NEXT]").zh;
  assert.match(zh, /还没有真正回答/);
  assert.match(zh, /绝对不要加 \[NEXT\]/);

  const en = PROMPTS.followUp.awaitingAnswer("[NEXT]").en;
  assert.match(en, /has not actually answered/);
  assert.match(en, /greeting/);
  assert.match(en, /repeat the question/);
  assert.match(en, /Do NOT add \[NEXT\]/);
});

test("normal response prompt defaults to moving on after a direct answer", () => {
  const prompt = PROMPTS.response.normal(basePromptParams({
    qText: "你觉得自己在美妆产品销售和顾客沟通方面有哪些优势呢？",
    history: "美妆HR助手: 你觉得自己在美妆产品销售和顾客沟通方面有哪些优势呢？\n受访者: 我的销售和沟通优势在于两年工作经历、懂产品、真诚沟通、理解客户痛点并转化消费者。",
    latestInterviewerPrompt: "你觉得自己在美妆产品销售和顾客沟通方面有哪些优势呢？",
    latestParticipantAnswer: "我的销售和沟通优势在于两年工作经历、懂产品、真诚沟通、理解客户痛点并转化消费者。",
    userTurns: 4,
  })).zh;

  assert.match(prompt, /如果已经正面回答了你刚才的问题/);
  assert.match(prompt, /默认应简短确认并进入下一题/);
  assert.match(prompt, /只有当关键信息仍明显缺失时/);
});
