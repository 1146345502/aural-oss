import assert from "node:assert/strict";
import test from "node:test";

import { shouldAllowTtsBargeIn } from "../server/openai-voice-relay-helpers";

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
