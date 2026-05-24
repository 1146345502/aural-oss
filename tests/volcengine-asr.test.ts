import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import {
    buildBigModelFullRequest,
    resolveBigModelAsrLanguage,
} from "../server/volcengine-asr";

function decodeFullRequestPayload(packet: Buffer) {
  const payloadSize = packet.readUInt32BE(8);
  const compressed = packet.subarray(12, 12 + payloadSize);
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

test("resolveBigModelAsrLanguage maps English interviews to en-US", () => {
  assert.equal(resolveBigModelAsrLanguage("English"), "en-US");
  assert.equal(resolveBigModelAsrLanguage("english"), "en-US");
  assert.equal(resolveBigModelAsrLanguage("en"), "en-US");
});

test("resolveBigModelAsrLanguage leaves non-English unspecified", () => {
  assert.equal(resolveBigModelAsrLanguage("zh"), undefined);
  assert.equal(resolveBigModelAsrLanguage("Chinese"), undefined);
  assert.equal(resolveBigModelAsrLanguage(""), undefined);
});

test("buildBigModelFullRequest includes ASR language and DDC settings", () => {
  const packet = buildBigModelFullRequest({
    language: "en-US",
    enableDdc: true,
  }, "test-user");

  const payload = decodeFullRequestPayload(packet);
  assert.equal(payload.audio.language, "en-US");
  assert.equal(payload.request.enable_ddc, true);
});
