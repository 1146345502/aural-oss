import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { gunzipSync } from "node:zlib";
import { WebSocket, WebSocketServer } from "ws";
import { connectStreamingAsr, resolveAsrProvider } from "../server/streaming-asr";

test("Seed stays the default and an invalid selection fails explicitly", () => {
  assert.equal(resolveAsrProvider(), "seed");
  assert.equal(resolveAsrProvider(" QWEN "), "qwen");
  assert.equal(resolveAsrProvider("qwen-audio"), "qwen-audio");
  assert.throws(() => resolveAsrProvider("unknown"), /VOICE_ASR_PROVIDER/);
});

test("Audio 3.0 waits for its task-started event, sends binary PCM, and finishes the same task once", async (t) => {
  const { server, url } = await localServer(t);
  const messages: Array<{ binary: boolean; data: Buffer }> = [];
  let acknowledge!: () => void;
  const configured = new Promise<void>((resolve) => {
    server.on("connection", (socket) => socket.on("message", (data, binary) => {
      messages.push({ binary, data: Buffer.from(data as Buffer) });
      if (!binary && JSON.parse(data.toString()).header.action === "run-task") {
        acknowledge = () => socket.send(JSON.stringify({ header: { task_id: "task", event: "task-started" } }));
        // A stale task acknowledgement must not unlock this connection.
        socket.send(JSON.stringify({ header: { task_id: "old", event: "task-started" } }));
        resolve();
      }
    }));
  });
  let ready = false;
  const pending = connectStreamingAsr({ provider: "qwen-audio", apiKey: "test-only-key", requestId: "task", config: { language: "en-US", endWindowSize: 800 } }, (target, options) => {
    assert.equal(target, "wss://dashscope.aliyuncs.com/api-ws/v1/inference");
    return new WebSocket(url, options);
  }).then((connection) => { ready = true; return connection; });
  await configured;
  assert.equal(ready, false);
  acknowledge();
  const connection = await pending;
  t.after(() => connection.close());
  const finished = new Promise<void>((resolve) => [...server.clients][0].on("message", (data, binary) => {
    if (!binary && JSON.parse(data.toString()).header.action === "finish-task") resolve();
  }));
  const pcm = Buffer.from([255, 127, 0, 128]);
  connection.sendAudio(pcm); connection.finish(); connection.finish(); connection.sendAudio(pcm);
  await finished;
  assert.equal(messages.length, 3);
  assert.equal(JSON.parse(messages[0].data.toString()).payload.model, "qwen-audio-3.0-asr-flash-streaming");
  assert.equal(messages[1].binary, true);
  assert.deepEqual(messages[1].data, pcm);
  assert.equal(JSON.parse(messages[2].data.toString()).header.task_id, "task");
  assert.equal(connection.parseMessage(Buffer.from(JSON.stringify({ header: { task_id: "task", event: "task-failed", error_message: "test-only-key denied" } })))?.errorMessage, "[redacted] denied");
});

async function localServer(t: { after(fn: () => void): void }) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(() => { for (const client of server.clients) client.terminate(); server.close(); });
  return { server, url: `ws://127.0.0.1:${address.port}` };
}

test("Qwen transport waits for configuration acknowledgement and sends native audio/finish", async (t) => {
  const { server, url } = await localServer(t);
  const messages: Array<{ type: string; audio?: string; session?: { sample_rate: number } }> = [];
  let acknowledge!: () => void;
  const configured = new Promise<void>((resolve) => {
    server.on("connection", (socket, request) => {
      assert.equal(request.headers.authorization, "Bearer test-only-key");
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString()); messages.push(message);
        if (message.type === "session.update") {
          acknowledge = () => socket.send(JSON.stringify({ type: "session.updated" }));
          resolve();
        }
      });
    });
  });
  let ready = false;
  const pending = connectStreamingAsr({ provider: "qwen", apiKey: "test-only-key", requestId: "id", config: { endWindowSize: 800 } }, (target, options) => {
    assert.equal(new URL(target).searchParams.get("model"), "qwen3-asr-flash-realtime");
    return new WebSocket(url, options);
  }).then((connection) => { ready = true; return connection; });
  await configured;
  assert.equal(ready, false, "socket open must not announce readiness before session.updated");
  acknowledge();
  const connection = await pending;
  t.after(() => connection.close());
  const receivedFinish = new Promise<void>((resolve) => {
    const socket = [...server.clients][0];
    socket.on("message", (data) => { if (JSON.parse(data.toString()).type === "session.finish") resolve(); });
  });
  const pcm = Buffer.from([1, 0, 255, 127]);
  connection.sendAudio(pcm); connection.finish(); connection.finish(); connection.sendAudio(pcm);
  await receivedFinish;
  assert.deepEqual(messages.map((message) => message.type), ["session.update", "input_audio_buffer.append", "session.finish"]);
  assert.deepEqual(Buffer.from(messages[1].audio!, "base64"), pcm);
  const error = connection.parseMessage(Buffer.from(JSON.stringify({ type: "error", error: { message: "test-only-key rejected" } })));
  assert.equal(error?.errorMessage, "[redacted] rejected");
});

test("Qwen configuration rejection closes the socket and redacts credentials", async (t) => {
  const { server, url } = await localServer(t);
  server.on("connection", (socket) => socket.on("message", () => socket.send(JSON.stringify({ type: "error", error: { message: "test-only-key invalid" } }))));
  await assert.rejects(connectStreamingAsr({ provider: "qwen", apiKey: "test-only-key", requestId: "id", config: {} }, (_target, options) => new WebSocket(url, options)), /\[redacted\] invalid/);
});

test("Seed transport retains its binary configuration and end-of-stream sequence", async (t) => {
  const { server, url } = await localServer(t);
  const messages: Buffer[] = [];
  let finishReceived!: () => void;
  const done = new Promise<void>((resolve) => { finishReceived = resolve; });
  server.on("connection", (socket, request) => {
    assert.equal(request.headers["x-api-key"], "test-only-key");
    assert.equal(request.headers["x-api-resource-id"], "volc.seedasr.sauc.duration");
    socket.on("message", (data) => { const bytes = Buffer.from(data as Buffer); messages.push(bytes); if ((bytes[1] & 0x0f) === 3) finishReceived(); });
  });
  const connection = await connectStreamingAsr({ provider: "seed", apiKey: "test-only-key", resourceId: "volc.seedasr.sauc.duration", requestId: "id", config: { enableNonstream: true, endWindowSize: 800 } }, (_target, options) => new WebSocket(url, options));
  t.after(() => connection.close());
  connection.sendAudio(Buffer.from([0, 1]));connection.finish(); await done;
  const request = JSON.parse(gunzipSync(messages[0].subarray(12)).toString());
  assert.equal(request.request.enable_nonstream, true);
  assert.equal(request.request.end_window_size, 800);
  assert.equal(messages[1].readInt32BE(4), 2);
  assert.equal(messages[2].readInt32BE(4), -3);
});
