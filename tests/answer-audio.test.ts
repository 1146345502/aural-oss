import assert from "node:assert/strict";
import test from "node:test";

import {
    estimateBase64DecodedBytes,
    formatPrepAudioDuration,
    isPrepAnswerAudioWithinLimit,
    PREP_ANSWER_AUDIO_MAX_BYTES,
} from "../src/lib/prep/answer-audio";

test("estimateBase64DecodedBytes accounts for padding", () => {
  const raw = Buffer.from("hello world");
  const b64 = raw.toString("base64");
  assert.equal(estimateBase64DecodedBytes(b64), raw.length);
});

test("isPrepAnswerAudioWithinLimit rejects oversized payloads", () => {
  const big = Buffer.alloc(PREP_ANSWER_AUDIO_MAX_BYTES + 1).toString("base64");
  assert.equal(isPrepAnswerAudioWithinLimit(big), false);
  const ok = Buffer.alloc(1024).toString("base64");
  assert.equal(isPrepAnswerAudioWithinLimit(ok), true);
});

test("formatPrepAudioDuration renders seconds label", () => {
  assert.equal(formatPrepAudioDuration(12), "12s");
  assert.equal(formatPrepAudioDuration(74), "74s");
  assert.equal(formatPrepAudioDuration(14.9), "14s");
});
