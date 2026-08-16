import assert from "node:assert/strict";
import test from "node:test";

import {
    bufferMicAudioChunk,
    createMicFrameChunker,
    encodeMicAudioChunk,
    MIC_AUDIO_CHUNK_SAMPLES,
    MIC_AUDIO_FRAME_SAMPLES,
    MIC_AUDIO_SAMPLE_RATE,
} from "../src/lib/voice/mic-audio";

test("microphone audio uses low-latency 64ms chunks", () => {
  assert.equal((MIC_AUDIO_CHUNK_SAMPLES / MIC_AUDIO_SAMPLE_RATE) * 1_000, 64);
});

test("uplink frames are 200ms, the size the ASR provider performs best with", () => {
  assert.equal((MIC_AUDIO_FRAME_SAMPLES / MIC_AUDIO_SAMPLE_RATE) * 1_000, 200);
});

test("frame chunker emits fixed-size frames and carries the remainder forward", () => {
  const toFrames = createMicFrameChunker(4);
  const emitted: number[][] = [];
  const collect = (frame: Float32Array) => emitted.push([...frame]);

  // Capture buffers that do not divide into the frame size, as Web Audio delivers them.
  toFrames(new Float32Array([1, 2, 3]), collect);
  assert.deepEqual(emitted, [], "a partial frame is held back rather than padded");

  toFrames(new Float32Array([4, 5, 6, 7, 8]), collect);
  assert.deepEqual(emitted, [[1, 2, 3, 4], [5, 6, 7, 8]]);

  toFrames(new Float32Array([9]), collect);
  assert.deepEqual(emitted.length, 2, "the trailing sample waits for the next buffer");
});

test("frame chunker loses no samples across a long capture stream", () => {
  const toFrames = createMicFrameChunker(MIC_AUDIO_FRAME_SAMPLES);
  const captureSamples = 4_096;
  const buffers = 25;
  let received = 0;
  let expectedNext = 0;
  let ordered = true;

  for (let b = 0; b < buffers; b++) {
    const input = new Float32Array(captureSamples);
    for (let i = 0; i < captureSamples; i++) input[i] = b * captureSamples + i;
    toFrames(input, (frame) => {
      received += frame.length;
      for (const sample of frame) {
        if (sample !== expectedNext) ordered = false;
        expectedNext++;
      }
    });
  }

  const total = captureSamples * buffers;
  assert.ok(ordered, "samples must stay in capture order");
  assert.equal(received, total - (total % MIC_AUDIO_FRAME_SAMPLES));
  assert.ok(total - received < MIC_AUDIO_FRAME_SAMPLES, "only a partial frame may be pending");
});

test("frame chunker hands out independent buffers", () => {
  const toFrames = createMicFrameChunker(2);
  const frames: Float32Array[] = [];
  toFrames(new Float32Array([1, 2, 3, 4]), (frame) => frames.push(frame));

  assert.equal(frames.length, 2);
  assert.deepEqual([...frames[0]], [1, 2], "an earlier frame must not be overwritten by a later one");
  assert.deepEqual([...frames[1]], [3, 4]);
});

test("microphone samples are encoded as clamped little-endian PCM16", () => {
  assert.equal(
    encodeMicAudioChunk(new Float32Array([-1, -0.5, 0, 0.5, 1])),
    "008000c000000040ff7f",
  );
});

test("relay startup buffering keeps the newest audio within its bound", () => {
  const pending: string[] = [];
  bufferMicAudioChunk(pending, "one", 2);
  bufferMicAudioChunk(pending, "two", 2);
  bufferMicAudioChunk(pending, "three", 2);
  assert.deepEqual(pending, ["two", "three"]);
});
