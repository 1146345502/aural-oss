import assert from "node:assert/strict";
import test from "node:test";
import {
  QWEN_ASR_MODEL, QWEN_ASR_URL, buildQwenSessionUpdate, buildQwenAudioAppend,
  buildQwenSessionFinish, createQwenAsrState, parseQwenAsrResponse,
} from "../server/qwen-asr";
import { createAsrSessionState, deriveAsrSessionUpdate, markAsrSessionCommitted } from "../server/voice-relay-helpers";

test("supported Qwen alias and capture settings avoid retiring checkpoints", () => {
  assert.equal(QWEN_ASR_MODEL, "qwen3-asr-flash-realtime");
  assert.equal(new URL(QWEN_ASR_URL).searchParams.get("model"), QWEN_ASR_MODEL);
  const english = buildQwenSessionUpdate("en-US", 800).session;
  assert.equal(english.input_audio_transcription?.language, "en");
  assert.equal(english.sample_rate, 16000);
  assert.equal(english.input_audio_format, "pcm");
  assert.deepEqual(english.turn_detection, { type: "server_vad", threshold: 0.3, silence_duration_ms: 800 });
  assert.equal(buildQwenSessionUpdate("Chinese").session.input_audio_transcription?.language, "zh");
});

test("Qwen realtime retracts a tiny wrong-script correction before it can become a new turn", () => {
  const state = createQwenAsrState("English");
  const relay = createAsrSessionState();
  deriveAsrSessionUpdate(relay, parseQwenAsrResponse(state, { type: "conversation.item.input_audio_transcription.text", item_id: "a", stash: "So" })!, true);
  const packet = parseQwenAsrResponse(state, { type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "再。" })!;
  assert.equal(deriveAsrSessionUpdate(relay, packet, true).text, "");
  assert.equal(parseQwenAsrResponse(createQwenAsrState("Chinese"), { type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "对。" })?.text, "对。");
});

test("PCM append preserves bytes and finish ends the session without manual VAD commit", () => {
  const pcm = Buffer.from([0, 127, 255, 128]);
  const append = buildQwenAudioAppend(pcm);
  assert.equal(append.type, "input_audio_buffer.append");
  assert.deepEqual(Buffer.from(append.audio, "base64"), pcm);
  assert.equal(buildQwenSessionFinish().type, "session.finish");
});

test("stable text plus replaceable stash updates captions without duplicating old drafts", () => {
  const qwen = createQwenAsrState();
  const relay = createAsrSessionState();
  const first = parseQwenAsrResponse(qwen, { type: "conversation.item.input_audio_transcription.text", item_id: "a", text: "I use ", stash: "post gray" })!;
  assert.equal(deriveAsrSessionUpdate(relay, first).text, "I use post gray");
  const revised = parseQwenAsrResponse(qwen, { type: "conversation.item.input_audio_transcription.text", item_id: "a", text: "I use ", stash: "PostgreSQL" })!;
  assert.equal(deriveAsrSessionUpdate(relay, revised).text, "I use PostgreSQL");
  const final = parseQwenAsrResponse(qwen, { type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "I use PostgreSQL." })!;
  assert.equal(deriveAsrSessionUpdate(relay, final).definite, true);
});

test("committed turns are not replayed when another Qwen item arrives", () => {
  const qwen = createQwenAsrState();
  const relay = createAsrSessionState();
  const final = { type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "First answer." };
  deriveAsrSessionUpdate(relay, parseQwenAsrResponse(qwen, final)!);
  markAsrSessionCommitted(relay);
  assert.equal(deriveAsrSessionUpdate(relay, parseQwenAsrResponse(qwen, final)!).changed, false);
  const next = parseQwenAsrResponse(qwen, { type: "conversation.item.input_audio_transcription.text", item_id: "b", text: "", stash: "Second answer" })!;
  assert.equal(deriveAsrSessionUpdate(relay, next).text, "Second answer");
  assert.equal(deriveAsrSessionUpdate(relay, next).definite, false);
});

test("newer speech stays open when an older item finishes late", () => {
  const qwen = createQwenAsrState();
  const relay = createAsrSessionState();
  parseQwenAsrResponse(qwen, { type: "input_audio_buffer.speech_started", item_id: "a" });
  parseQwenAsrResponse(qwen, { type: "input_audio_buffer.speech_started", item_id: "b" });
  parseQwenAsrResponse(qwen, { type: "conversation.item.input_audio_transcription.text", item_id: "b", stash: "still speaking" });
  const delayed = parseQwenAsrResponse(qwen, { type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "Earlier sentence." })!;
  const update = deriveAsrSessionUpdate(relay, delayed);
  assert.equal(update.text, "Earlier sentence. still speaking");
  assert.equal(update.definite, false);
});

test("late partials cannot overwrite a final and reconnect state is independent", () => {
  const state = createQwenAsrState();
  parseQwenAsrResponse(state, { type: "conversation.item.input_audio_transcription.completed", item_id: "a", transcript: "最终答案。" });
  assert.equal(parseQwenAsrResponse(state, { type: "conversation.item.input_audio_transcription.text", item_id: "a", stash: "旧的草稿" }), null);
  const fresh = createQwenAsrState();
  assert.equal(parseQwenAsrResponse(fresh, { type: "conversation.item.input_audio_transcription.text", item_id: "a", stash: "新的答案" })!.text, "新的答案");
});

test("non-text control events do not create captions or end an interview turn", () => {
  const state = createQwenAsrState();
  for (const type of ["session.created", "session.updated", "session.finished", "input_audio_buffer.speech_stopped"]) {
    assert.equal(parseQwenAsrResponse(state, { type }), null);
  }
  assert.throws(() => parseQwenAsrResponse(state, { type: "conversation.item.input_audio_transcription.text", stash: "words" }), /item_id/);
});

test("provider and transcription failures are reported as ASR errors", () => {
  for (const type of ["error", "conversation.item.input_audio_transcription.failed"]) {
    const result = parseQwenAsrResponse(createQwenAsrState(), { type, error: { message: "Unavailable" } });
    assert.equal(result?.errorCode, -1);
    assert.equal(result?.errorMessage, "Unavailable");
  }
});
