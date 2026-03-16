import assert from "node:assert/strict";
import test from "node:test";

import {
  JITTER_BUFFER_MAX_WAIT_MS,
  JITTER_BUFFER_TARGET_MS,
  PLAYBACK_SAMPLE_RATE,
  samplesToDurationMs,
  shouldFlushPlaybackQueue,
} from "@/lib/voice/playback-jitter-buffer";

test("samplesToDurationMs converts PCM sample counts to milliseconds", () => {
  assert.equal(samplesToDurationMs(24_000, PLAYBACK_SAMPLE_RATE), 1000);
  assert.equal(samplesToDurationMs(0, PLAYBACK_SAMPLE_RATE), 0);
});

test("playback queue flushes when low-water playback has enough buffered audio", () => {
  const queuedSamples = Math.ceil((PLAYBACK_SAMPLE_RATE * JITTER_BUFFER_TARGET_MS) / 1000);
  assert.equal(
    shouldFlushPlaybackQueue({
      queuedSamples,
      bufferedAheadMs: 10,
      firstChunkQueuedAtMs: 1000,
      nowMs: 1050,
    }),
    true,
  );
});

test("playback queue waits for more audio when enough playback is already buffered", () => {
  const queuedSamples = Math.ceil((PLAYBACK_SAMPLE_RATE * 80) / 1000);
  assert.equal(
    shouldFlushPlaybackQueue({
      queuedSamples,
      bufferedAheadMs: 220,
      firstChunkQueuedAtMs: 1000,
      nowMs: 1080,
    }),
    false,
  );
});

test("playback queue flushes after the max wait even if the target buffer was not met", () => {
  const queuedSamples = Math.ceil((PLAYBACK_SAMPLE_RATE * 40) / 1000);
  assert.equal(
    shouldFlushPlaybackQueue({
      queuedSamples,
      bufferedAheadMs: 200,
      firstChunkQueuedAtMs: 1000,
      nowMs: 1000 + JITTER_BUFFER_MAX_WAIT_MS + 5,
    }),
    true,
  );
});
