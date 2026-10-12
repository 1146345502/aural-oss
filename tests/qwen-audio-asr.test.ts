import assert from "node:assert/strict";
import test from "node:test";
import { buildQwenAudioTask, createQwenAudioAsrState, parseQwenAudioAsrResponse } from "../server/qwen-audio-asr";
import { combineAsrSessionText, createAsrSessionState, deriveAsrSessionUpdate, markAsrSessionCommitted, resetAsrSessionState } from "../server/voice-relay-helpers";

const event = (id: number, text: string, final = false) => ({
  header: { task_id: "task", event: "result-generated" },
  payload: { output: { sentence: { sentence_id: id, text, sentence_end: final } } },
});

test("Audio 3.0 uses realtime VAD, English hint and the bounded Seed context", () => {
  const task = buildQwenAudioTask("task", "en-US", 800, { context: JSON.stringify({ context_data: [{ text: "Interview topic: Aural " + "x".repeat(600) }] }) });
  assert.equal(task.payload.model, "qwen-audio-3.0-asr-flash-streaming");
  assert.equal(task.payload.parameters.max_sentence_silence, 800);
  assert.equal(task.payload.parameters.semantic_punctuation_enabled, false);
  assert.equal(task.payload.parameters.heartbeat, true);
  assert.equal(task.payload.parameters.speech_noise_threshold, 0.1);
  assert.deepEqual(task.payload.parameters.language_hints, ["en"]);
  assert.equal(task.payload.input.context?.[0].content[0].text.length, 400);
  assert.deepEqual(buildQwenAudioTask("task", "Chinese").payload.input, {});
  assert.deepEqual(buildQwenAudioTask("task", "Chinese").payload.parameters.language_hints, ["zh"]);
});

test("wrong-script fragments are retracted per sentence without losing prior speech or later revisions", () => {
  const state = createQwenAudioAsrState("English"), relay = createAsrSessionState();
  const update = (id: number, text: string, final = false) => deriveAsrSessionUpdate(relay, parseQwenAudioAsrResponse(state, event(id, text, final), "task")!, true);
  const answer = "I lead an engineering team and build reliable AI services.";
  assert.equal(update(1, answer, true).text, answer);
  markAsrSessionCommitted(relay);
  assert.equal(update(2, "So").text, "So");
  const retraction = update(2, "再。", true);
  assert.equal(retraction.text, "");
  assert.equal(retraction.changed, true);
  assert.equal(state.sentences.get(1)?.text, answer);
  assert.equal(update(3, "我负责架构设计。", true).text, "我负责架构设计。", "substantive code-switching is retained");
  const chinese = createQwenAudioAsrState("zh-CN");
  assert.equal(parseQwenAudioAsrResponse(chinese, event(1, "对。", true), "task")?.text, "对。", "Chinese interviews preserve short Chinese replies");
});

test("sentence revisions replace drafts, final correction removes phantom words, and next sentence preserves committed history", () => {
  const provider = createQwenAudioAsrState(), relay = createAsrSessionState();
  const update = (id: number, text: string, final = false) => deriveAsrSessionUpdate(relay, parseQwenAudioAsrResponse(provider, event(id, text, final), "task")!, true);
  assert.equal(update(1, "Thank you Hello we can hello").text, "Thank you Hello we can hello");
  assert.equal(update(1, "Hello. Can you hear me?", true).text, "Hello. Can you hear me?");
  markAsrSessionCommitted(relay);
  assert.equal(update(2, "My name is Qingyuan.", true).text, "My name is Qingyuan.");
  assert.equal(update(2, "My name is Qingyuan.", true).changed, false);
  assert.equal(parseQwenAudioAsrResponse(provider, event(2, "Nguyen"), "task"), null);
});

test("heartbeat/control/old task events do not make phantom captions", () => {
  const state = createQwenAudioAsrState();
  assert.equal(parseQwenAudioAsrResponse(state, { ...event(0, "fake"), payload: { output: { sentence: { heartbeat: true, text: "fake" } } } }, "task"), null);
  assert.equal(parseQwenAudioAsrResponse(state, event(1, "old"), "new-task"), null);
  assert.equal(parseQwenAudioAsrResponse(state, { header: { task_id: "task", event: "task-started" } }, "task"), null);
  assert.equal(state.sentences.size, 0);
});

test("out of order finals do not endpoint a newer draft", () => {
  const state = createQwenAudioAsrState(), relay = createAsrSessionState();
  parseQwenAudioAsrResponse(state, event(2, "Second incomplete"), "task");
  const packet = parseQwenAudioAsrResponse(state, event(1, "First complete", true), "task")!;
  const update = deriveAsrSessionUpdate(relay, packet, true);
  assert.equal(update.text, "First complete Second incomplete");
  assert.equal(update.definite, false);
});

test("provider can retract all phantom speech while Seed's empty heartbeat semantics remain unchanged", () => {
  const state = createQwenAudioAsrState(), relay = createAsrSessionState();
  deriveAsrSessionUpdate(relay, parseQwenAudioAsrResponse(state, event(1, "Thank you"), "task")!, true);
  const empty = parseQwenAudioAsrResponse(state, event(1, "", true), "task")!;
  assert.deepEqual(deriveAsrSessionUpdate(relay, empty, true), { text: "", changed: true, definite: false });
  const seed = createAsrSessionState();
  deriveAsrSessionUpdate(seed, { text: "Real speech" });
  assert.equal(deriveAsrSessionUpdate(seed, {}).text, "Real speech");
});

test("task failure surfaces and invalid sentence identity fails rather than merging unrelated speech", () => {
  const state = createQwenAudioAsrState();
  assert.equal(parseQwenAudioAsrResponse(state, { header: { task_id: "task", event: "task-failed", error_message: "denied" } }, "task")?.errorMessage, "denied");
  assert.throws(() => parseQwenAudioAsrResponse(state, { header: { task_id: "task", event: "result-generated" }, payload: { output: { sentence: { text: "wrong" } } } }, "task"), /missing identity/);
});

test("a replacement task's empty correction cannot retract a long answer from the previous task", () => {
  const relay = createAsrSessionState();
  const first = createQwenAudioAsrState();
  const prefix = "I start by understanding the problem and defining success. I discuss requirements with the team and measure scalability before selecting the architecture.";
  const carried = deriveAsrSessionUpdate(relay, parseQwenAudioAsrResponse(first, event(1, prefix, true), "task")!, true).text;
  resetAsrSessionState(relay);
  const replacement = createQwenAudioAsrState();
  const update = (text: string, final = false) => deriveAsrSessionUpdate(relay, parseQwenAudioAsrResponse(replacement, event(1, text, final), "task")!, true);
  assert.equal(combineAsrSessionText(carried, update("phantom tail").text, true), prefix + " phantom tail");
  const retraction = update("", true);
  assert.equal(retraction.changed, true);
  assert.equal(combineAsrSessionText(carried, retraction.text, true), prefix);
  // A subsequent sentence belongs after the carry, even if it repeats wording.
  const final = deriveAsrSessionUpdate(relay, parseQwenAudioAsrResponse(replacement, event(2, "I discuss requirements with the team again.", true), "task")!, true);
  assert.equal(combineAsrSessionText(carried, final.text, true), prefix + " I discuss requirements with the team again.");
});
