import assert from "node:assert/strict";
import test from "node:test";

import { buildInterviewerPrompt } from "../src/lib/ai/prompts/interviewer";
import { maxFollowUpsForDepth } from "../src/lib/follow-up-depth";

type PromptArgs = Parameters<typeof buildInterviewerPrompt>[0];

function systemPromptFor(followUpDepth: string | null): string {
  const interview = {
    aiName: "Aural",
    title: "Beauty advisor screening",
    objective: "Assess sales and communication skills",
    aiTone: "Professional",
    language: "en",
    followUpDepth,
    chatEnabled: true,
    voiceEnabled: false,
    videoEnabled: false,
    questions: [
      { text: "Walk me through a tough customer.", type: "TEXT", description: null, options: null },
      { text: "How do you keep up with new products?", type: "RESEARCH", description: null, options: null },
    ],
  };

  const [system] = buildInterviewerPrompt({
    interview,
    conversationHistory: [],
    currentQuestionIndex: 0,
  } as unknown as PromptArgs);

  const { content } = system;
  assert.equal(system.role, "system");
  assert.ok(typeof content === "string", "system prompt should be plain text");
  return content;
}

test("MODERATE states the 1-2 follow-up budget the creator picked as a hard limit", () => {
  const prompt = systemPromptFor("MODERATE");
  assert.equal(maxFollowUpsForDepth("MODERATE"), 2);

  assert.match(prompt, /HARD LIMIT of 2 follow-ups per scripted question/);
  assert.match(prompt, /Ask at most 2 follow-ups per scripted question/);
  assert.match(prompt, /you MUST move to the next scripted question/);
});

test("LIGHT asks for no follow-ups at all", () => {
  const prompt = systemPromptFor("LIGHT");
  assert.equal(maxFollowUpsForDepth("LIGHT"), 0);

  assert.match(prompt, /Ask only the scripted questions/);
  assert.doesNotMatch(prompt, /Ask at most 0 follow-ups/);
});

test("DEEP raises the budget but still names a limit", () => {
  const prompt = systemPromptFor("DEEP");
  assert.equal(maxFollowUpsForDepth("DEEP"), 5);

  assert.match(prompt, /HARD LIMIT of 5 follow-ups per scripted question/);
  // The old copy promised unlimited probing, which is what over-ran the budget.
  assert.doesNotMatch(prompt, /until you feel the topic is fully explored/);
});

test("RESEARCH questions get a bigger budget that is still bounded", () => {
  const prompt = systemPromptFor("MODERATE");
  assert.equal(maxFollowUpsForDepth("MODERATE", "RESEARCH"), 4);

  assert.match(prompt, /up to 4 follow-ups instead of 2/);
  assert.match(prompt, /still a hard limit/);
  assert.doesNotMatch(prompt, /Override the normal follow-up limit/);
});

test("answering the participant does not spend the follow-up budget", () => {
  assert.match(
    systemPromptFor("MODERATE"),
    /does not count against this budget/,
  );
});

test("an unset depth falls back to the MODERATE budget rather than going unbounded", () => {
  for (const depth of [null, "medium"]) {
    const prompt = systemPromptFor(depth);
    assert.match(
      prompt,
      /HARD LIMIT of 2 follow-ups per scripted question/,
      `depth=${String(depth)}`,
    );
  }
});
