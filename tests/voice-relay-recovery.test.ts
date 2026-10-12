import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import WebSocket, { WebSocketServer } from "ws";

const prefix = "I start by understanding the problem and defining success. I discuss requirements with the team and measure scalability before selecting the architecture.";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function freePort(): Promise<number> {
  const socket = net.createServer();
  await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  return port;
}

async function connectRelay(
  port: number,
  hasExited: () => boolean,
  getLogs: () => string,
  timeoutMs = 5_000,
): Promise<WebSocket> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !hasExited()) {
    // The startup log is emitted before the socket has finished binding.
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { handshakeTimeout: deadline - Date.now() });
    try {
      await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.on("error", reject); });
      return ws;
    } catch (error) {
      ws.terminate();
      // Only a listener that has not bound yet is retryable; protocol errors must fail.
      if ((error as NodeJS.ErrnoException).code !== "ECONNREFUSED") throw error;
      await sleep(30);
    }
  }
  throw new Error(`Relay startup failed: ${getLogs()}`);
}

test("relay readiness waits for the WebSocket handshake after a delayed socket bind", async () => {
  const port = await freePort();
  const server = createServer();
  const relay = new WebSocketServer({ server });
  const start = setTimeout(() => server.listen(port, "127.0.0.1"), 100);
  let ws: WebSocket | undefined;
  try {
    ws = await connectRelay(port, () => false, () => "Listening on");
    assert.equal(ws.readyState, WebSocket.OPEN);
  } finally {
    clearTimeout(start);
    ws?.terminate();
    relay.clients.forEach(client => client.terminate());
    await new Promise<void>(resolve => relay.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("relay readiness fails promptly with startup logs if the child exits", async () => {
  await assert.rejects(connectRelay(0, () => true, () => "startup crashed"), /Relay startup failed: startup crashed/);
});

test("relay readiness does not retry a WebSocket protocol failure", async () => {
  const server = createServer((_req, res) => { res.writeHead(503); res.end(); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as net.AddressInfo).port;
    await assert.rejects(connectRelay(port, () => false, () => "Listening on"), /Unexpected server response: 503/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("relay rejects So-to-Han noise during playback but accepts a final short reply", { timeout: 15_000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aural-asr-fragments-"));
  const envFile = path.join(dir, "empty.env");
  await writeFile(envFile, "");
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", "tsx", "--require", "./tests/fixtures/asr-recovery-mock.cjs", "server/voice-relay.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      NODE_ENV: "test", AURAL_ENV_FILE: envFile, VOICE_RELAY_PORT: String(port), VOICE_RELAY_HOST: "127.0.0.1",
      VOICE_ASR_PROVIDER: "qwen-audio", QWEN_ASR_API_KEY: "local-test-placeholder", DOUBAO_APP_ID: "local-test", DOUBAO_ACCESS_TOKEN: "local-test-placeholder", ASR_TEST_FAULT: "fragments" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });
  let ws: WebSocket | undefined;
  const events: Array<{ type: string; text?: string }> = [];
  const until = async (predicate: () => boolean) => {
    const end = Date.now() + 5_000;
    while (!predicate()) { if (Date.now() > end) throw new Error(logs); await sleep(20); }
  };
  try {
    ws = await connectRelay(port, () => child.exitCode !== null || child.signalCode !== null, () => logs);
    ws.on("message", (data, binary) => { if (!binary) events.push(JSON.parse(data.toString())); });
    ws.send(JSON.stringify({ type: "init", context: { title: "English interview", language: "English", aiName: "Aural",
      questions: [{ text: "Can you explain your project?", type: "OPEN_ENDED", order: 0 }] } }));
    // Leave playback unacknowledged to exercise ASR-driven interruption.
    await until(() => events.some(event => event.type === "tts_ended"));
    const greetingInterrupts = events.filter(event => event.type === "interrupt").length;
    const sendFrame = (level: number) => {
      const frame = Buffer.alloc(3200); for (let i = 0; i < frame.length; i += 2) frame.writeInt16LE(level, i);
      ws!.send(JSON.stringify({ type: "audio", data: frame.toString("hex") }));
    };
    sendFrame(6000);
    await sleep(250);
    assert.equal(events.filter(event => event.type === "interrupt").length, greetingInterrupts, "ambiguous draft must not stop playback");
    assert.equal(events.some(event => event.type === "asr_ended" || event.type === "asr_pending"), false, "wrong-script noise must not start a user turn");
    assert.equal(logs.includes("ASR FINAL"), false);
    sendFrame(8000);
    await until(() => events.some(event => event.type === "asr_ended"));
    assert.ok(events.filter(event => event.type === "interrupt").length > greetingInterrupts, "confirmed short speech still interrupts");
    assert.ok(logs.includes('Barge-in detected via ASR (final: "Yes.")'), "short final must be accepted during playback");
    assert.deepEqual(events.filter(event => event.type === "asr_ended").map(event => event.text), ["Yes."]);
  } finally {
    ws?.close(); child.kill("SIGTERM");
    await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", () => resolve()); });
    await rm(dir, { recursive: true, force: true });
  }
});

for (const fault of ["stuck", "disconnect"]) {
  test(`relay retains the full answer after ${fault} recovery and replacement task retraction`, { timeout: 25_000 }, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "aural-asr-recovery-"));
    const envFile = path.join(dir, "empty.env");
    await writeFile(envFile, "");
    const port = await freePort();
    const child = spawn(process.execPath, ["--import", "tsx", "--require", "./tests/fixtures/asr-recovery-mock.cjs", "server/voice-relay.ts"], {
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        NODE_ENV: "test", AURAL_ENV_FILE: envFile, VOICE_RELAY_PORT: String(port),
        VOICE_RELAY_HOST: "127.0.0.1", VOICE_ASR_PROVIDER: "qwen-audio",
        QWEN_ASR_API_KEY: "local-test-placeholder", DOUBAO_APP_ID: "local-test",
        DOUBAO_ACCESS_TOKEN: "local-test-placeholder", ASR_TEST_FAULT: fault,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout.on("data", chunk => { logs += chunk; });
    child.stderr.on("data", chunk => { logs += chunk; });
    let ws: WebSocket | undefined;
    try {
      const events: Array<{ type: string; text?: string; utteranceId?: string }> = [];
      ws = await connectRelay(port, () => child.exitCode !== null || child.signalCode !== null, () => logs);
      ws.on("message", (data, binary) => {
        if (binary) return;
        const event = JSON.parse(data.toString());
        events.push(event);
        if (event.type === "tts_ended") ws!.send(JSON.stringify({ type: "playback_ended", utteranceId: event.utteranceId }));
      });
      ws.send(JSON.stringify({ type: "init", context: {
        title: "Offline ASR recovery regression", aiName: "Aural", language: "English", followUpDepth: "deep",
        questions: [{ text: "How do you design scalable systems?", type: "OPEN_ENDED", order: 0 }],
      } }));
      const greetingBy = Date.now() + 5_000;
      while (!events.some(event => event.type === "tts_ended")) {
        if (Date.now() > greetingBy) throw new Error(`Greeting failed: ${logs}`);
        await sleep(20);
      }
      await sleep(300);
      const frame = Buffer.alloc(6400);
      for (let i = 0; i < frame.length; i += 2) frame.writeInt16LE(6000, i);
      // Keep the microphone active past the 5s stuck-recognizer recovery guard.
      for (let i = 0; i < 39; i++) {
        ws.send(JSON.stringify({ type: "audio", data: frame.toString("hex") }));
        await sleep(200);
        assert.equal(events.some(event => event.type === "asr_ended"), false, "must wait for the speaker to finish");
      }
      const settledBy = Date.now() + 6_000;
      while (!events.some(event => event.type === "asr_ended") && Date.now() < settledBy) await sleep(30);
      const finals = events.filter(event => event.type === "asr_ended");
      assert.equal(finals.length, 1, logs);
      assert.equal(finals[0].text, prefix, "earlier speech must survive; replacement task's phantom words must disappear");
      assert.ok(logs.includes("ASR task retraction retained speech"), "test must actually exercise the empty correction after recovery");
      assert.equal(events.some(event => event.type === "asr_cancelled"), false, "caption must not blink away during task retraction");
    } finally {
      ws?.close();
      child.kill("SIGTERM");
      await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", () => resolve()); });
      await rm(dir, { recursive: true, force: true });
    }
  });
}
