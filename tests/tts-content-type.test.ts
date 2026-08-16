import assert from "node:assert/strict";
import test from "node:test";

import { isBrowserPlayableTtsContentType } from "../src/lib/voice/tts-content-type";

test("accepts the MP3 response Seed TTS returns for a WAV preference", () => {
  assert.equal(isBrowserPlayableTtsContentType("audio/mpeg"), true);
  assert.equal(isBrowserPlayableTtsContentType("audio/mp3; charset=binary"), true);
});

test("accepts browser-playable WAV variants", () => {
  assert.equal(isBrowserPlayableTtsContentType("audio/wav"), true);
  assert.equal(isBrowserPlayableTtsContentType("audio/x-wav"), true);
  assert.equal(isBrowserPlayableTtsContentType("audio/wave"), true);
});

test("rejects JSON errors and raw PCM", () => {
  assert.equal(isBrowserPlayableTtsContentType("application/json"), false);
  assert.equal(isBrowserPlayableTtsContentType("application/octet-stream"), false);
  assert.equal(isBrowserPlayableTtsContentType(""), false);
});
