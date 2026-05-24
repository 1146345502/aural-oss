import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const relayPath = path.join(
  fileURLToPath(new URL("../server/voice-relay.ts", import.meta.url)),
);

function readVoiceRelaySource(): string {
  return fs.readFileSync(relayPath, "utf8");
}

describe("server/voice-relay.ts reconnect & lifecycle (source checks)", () => {
  it("defines ASR reconnect tuning constants", () => {
    const src = readVoiceRelaySource();
    assert.match(src, /const MAX_RECONNECT_ATTEMPTS = 3;/);
    assert.match(src, /const RECONNECT_DELAY_MS = 1000;/);
  });

  it("implements autoReconnectAsr and session reconnect events", () => {
    const src = readVoiceRelaySource();
    assert.match(src, /async function autoReconnectAsr\(\)/);
    assert.ok(src.includes('"session_reconnecting"'));
    assert.ok(src.includes('"session_reconnected"'));
  });

  it("uses 5000ms keep-alive intervals for silence audio", () => {
    const src = readVoiceRelaySource();
    const keepAliveIntervals = src.match(
      /keepAliveInterval = setInterval\([\s\S]*?, 5000\);/g,
    );
    assert.equal(
      keepAliveIntervals?.length,
      4,
      "mic test, response-cycle reopen, post-reconnect, and main interview keep-alive intervals",
    );
  });

  it("marks interviews done and detaches ASR listeners when the browser closes", () => {
    const src = readVoiceRelaySource();
    assert.ok(
      src.includes(`browserWs.on("close", () => {
    log.info("Browser disconnected");
    interviewDone = true;`),
    );
    assert.ok(src.includes("asrWs?.removeAllListeners();"));
  });

  it("installs a 10s safety timeout after farewell audio is queued", () => {
    const src = readVoiceRelaySource();
    assert.ok(
      src.includes(
        "Farewell TTS timed out after 10s — forcing interview end",
      ),
    );
    assert.match(
      src,
      /setTimeout\(\(\) => \{[\s\S]*?endInterview\(\);[\s\S]*?\}, 10_000\);/,
    );
  });
});
