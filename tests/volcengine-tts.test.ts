import assert from "node:assert/strict";
import test from "node:test";

import {
    detectTtsSourceEncoding,
    resolveTtsSpeechRate,
    synthesizeFull,
} from "../server/volcengine-tts";

test("resolveTtsSpeechRate returns undefined when unset", () => {
  assert.equal(resolveTtsSpeechRate(""), undefined);
  assert.equal(resolveTtsSpeechRate(undefined), undefined);
});

test("resolveTtsSpeechRate converts a speed multiplier to the provider value", () => {
  assert.equal(resolveTtsSpeechRate("0.9"), -10);
  assert.equal(resolveTtsSpeechRate("1"), 0);
});

test("resolveTtsSpeechRate clamps out-of-range values", () => {
  assert.equal(resolveTtsSpeechRate("0.1"), -50);
  assert.equal(resolveTtsSpeechRate("3"), 100);
});

test("resolveTtsSpeechRate ignores invalid values", () => {
  assert.equal(resolveTtsSpeechRate("fast"), undefined);
});

test("detectTtsSourceEncoding recognizes MP3 ID3 and frame sync", () => {
  assert.equal(
    detectTtsSourceEncoding(Buffer.from([0x49, 0x44, 0x33, 0x04])),
    "mp3",
  );
  assert.equal(
    detectTtsSourceEncoding(Buffer.from([0xff, 0xfb, 0x90, 0x00])),
    "mp3",
  );
});

test("detectTtsSourceEncoding treats aligned int16 as PCM", () => {
  const pcm = Buffer.alloc(8);
  pcm.writeInt16LE(100, 0);
  pcm.writeInt16LE(-200, 2);
  pcm.writeInt16LE(50, 4);
  pcm.writeInt16LE(-80, 6);
  assert.equal(detectTtsSourceEncoding(pcm), "pcm_s16le");
});

test("synthesizeFull parses adjacent streamed JSON objects", async (t) => {
  const sourceAudio = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({
        code: 0,
        message: "",
        data: sourceAudio.subarray(0, 2).toString("base64"),
      })));
      controller.enqueue(encoder.encode(
        JSON.stringify({
          code: 0,
          message: "",
          data: sourceAudio.subarray(2).toString("base64"),
        }) + JSON.stringify({
          code: 20000000,
          message: "ok",
          data: null,
        }),
      ));
      controller.close();
    },
  });

  t.mock.method(globalThis, "fetch", async () => new Response(stream));

  const audio = await synthesizeFull(
    "hello",
    { appId: "app", accessToken: "token", resourceId: "seed-tts-2.0" },
    { speaker: "en_female_dacey_uranus_bigtts", format: "pcm" },
  );

  assert.deepEqual(audio, sourceAudio);
});

test("synthesizeFull still collects audio when completion JSON precedes audio chunks", async (t) => {
  const sourceAudio = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            code: 20000000,
            message: "ok",
            data: null,
          }) +
            JSON.stringify({
              code: 0,
              message: "",
              data: sourceAudio.toString("base64"),
            }),
        ),
      );
      controller.close();
    },
  });

  t.mock.method(globalThis, "fetch", async () => new Response(stream));

  const audio = await synthesizeFull(
    "hello",
    { appId: "app", accessToken: "token", resourceId: "seed-tts-2.0" },
    { speaker: "en_female_dacey_uranus_bigtts", format: "pcm_s16le" },
  );

  assert.deepEqual(audio, sourceAudio);
});
