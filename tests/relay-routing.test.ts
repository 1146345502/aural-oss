import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelayTargets,
  RelayConnector,
  type RelaySocketLike,
  resolveRelayPrimaryPreference,
  resolveRelayUrls,
} from "../src/lib/voice/relay-routing";

class FakeSocket implements RelaySocketLike {
  readyState = 0;
  binaryType?: string;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emitJson(data: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emitError(): void {
    this.onerror?.();
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await flush();
  }
}

test("all interviews prefer voice relay by default", () => {
  const zhTargets = buildRelayTargets({
    language: "zh-CN",
    voiceRelayUrl: "ws://voice-primary:8766",
    openAiRelayUrl: "ws://openai-fallback:8767",
  });
  assert.deepEqual(
    zhTargets.map((target) => target.kind),
    ["voice", "openai"]
  );

  const enTargets = buildRelayTargets({
    language: "English",
    voiceRelayUrl: "ws://voice-fallback:8766",
    openAiRelayUrl: "ws://openai-primary:8767",
  });
  assert.deepEqual(
    enTargets.map((target) => target.kind),
    ["voice", "openai"]
  );
});

test("primary preference override forces voice relay for all languages", () => {
  const enTargets = buildRelayTargets({
    language: "en",
    primaryPreference: "voice",
    voiceRelayUrl: "ws://voice-primary:8766",
    openAiRelayUrl: "ws://openai-fallback:8767",
  });
  assert.deepEqual(
    enTargets.map((target) => target.kind),
    ["voice", "openai"],
  );

  const zhTargets = buildRelayTargets({
    language: "zh-CN",
    primaryPreference: "voice",
    voiceRelayUrl: "ws://voice-primary:8766",
    openAiRelayUrl: "ws://openai-fallback:8767",
  });
  assert.deepEqual(
    zhTargets.map((target) => target.kind),
    ["voice", "openai"],
  );
});

test("resolveRelayPrimaryPreference normalizes supported values and defaults to voice", () => {
  assert.equal(resolveRelayPrimaryPreference("voice"), "voice");
  assert.equal(resolveRelayPrimaryPreference("openai"), "openai");
  assert.equal(resolveRelayPrimaryPreference("VOICE"), "voice");
  assert.equal(resolveRelayPrimaryPreference(undefined), "voice");
  assert.equal(resolveRelayPrimaryPreference("unexpected"), "voice");
});

test("OpenAI relay URL derives from the voice relay URL when only the primary URL is configured", () => {
  const targets = buildRelayTargets({
    language: "en",
    voiceRelayUrl: "ws://localhost:8766",
  });

  assert.equal(targets[0].url, "ws://localhost:8766");
  assert.equal(targets[1].url, "ws://localhost:8767/");
});

test("Production browser defaults use same-origin relay paths instead of raw relay ports", () => {
  const targets = buildRelayTargets({
    language: "en",
    browserProtocol: "https:",
    browserHost: "aural-ai.com",
  });

  assert.equal(targets[0].url, "wss://aural-ai.com/ws/voice");
  assert.equal(targets[1].url, "wss://aural-ai.com/ws/openai-voice");
});

test("Same-origin voice relay URL derives a same-origin OpenAI relay path", () => {
  const urls = resolveRelayUrls({
    voiceRelayUrl: "wss://aural-ai.com/ws/voice",
  });

  assert.equal(urls.voiceRelayUrl, "wss://aural-ai.com/ws/voice");
  assert.equal(urls.openAiRelayUrl, "wss://aural-ai.com/ws/openai-voice");
});

test("RelayConnector falls back to the secondary relay when the primary never becomes ready", async () => {
  const sockets: FakeSocket[] = [];
  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [
      { kind: "voice", url: "ws://voice-primary:8766" },
      { kind: "openai", url: "ws://openai-fallback:8767" },
    ],
    buildInitMessage: () => ({ type: "init", context: { startQuestionIndex: 0 } }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
  });

  const connectPromise = connector.connect();

  assert.equal(sockets.length, 1);
  sockets[0].emitOpen();
  await flush();
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), {
    type: "init",
    context: { startQuestionIndex: 0 },
  });

  sockets[0].emitClose();
  await waitFor(() => sockets.length === 2);

  sockets[1].emitOpen();
  await flush();
  sockets[1].emitJson({ type: "ready" });

  const target = await connectPromise;
  assert.equal(target.kind, "openai");
  assert.equal(connector.target?.kind, "openai");
  assert.equal(connector.isReady, true);
});

test("RelayConnector fails over to the alternate relay after a mid-session disconnect when reconnect is disabled", async () => {
  const sockets: FakeSocket[] = [];
  const failovers: Array<{ from: string; to: string; reason: string }> = [];
  let currentQuestionIndex = 0;

  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [
      { kind: "openai", url: "ws://openai-primary:8767" },
      { kind: "voice", url: "ws://voice-fallback:8766" },
    ],
    reconnectAttempts: 0,
    buildInitMessage: () => ({
      type: "init",
      context: { startQuestionIndex: currentQuestionIndex },
    }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
    onFailover: ({ from, to, reason }) => {
      failovers.push({ from: from.kind, to: to.kind, reason });
    },
  });

  const connectPromise = connector.connect();
  sockets[0].emitOpen();
  await flush();
  sockets[0].emitJson({ type: "ready" });
  await connectPromise;

  currentQuestionIndex = 2;
  sockets[0].emitClose();

  await waitFor(() => sockets.length === 2);
  sockets[1].emitOpen();
  await flush();
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), {
    type: "init",
    context: { startQuestionIndex: 2 },
  });

  sockets[1].emitJson({ type: "ready" });
  await waitFor(() => failovers.length === 1);

  assert.deepEqual(failovers[0], {
    from: "openai",
    to: "voice",
    reason: "OpenAI voice relay disconnected",
  });

  const sent = connector.sendJson({ type: "ping" });
  assert.equal(sent, true);
  assert.deepEqual(JSON.parse(sockets[1].sent[1]), { type: "ping" });
});

test("RelayConnector retries the same relay before failing over after a mid-session disconnect", async () => {
  const sockets: FakeSocket[] = [];
  const failovers: Array<{ from: string; to: string; reason: string }> = [];
  const reconnects: Array<{ attempt: number; kind: string }> = [];

  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [
      { kind: "voice", url: "ws://voice-primary:8766" },
      { kind: "openai", url: "ws://openai-fallback:8767" },
    ],
    reconnectAttempts: 2,
    reconnectDelayMs: 1,
    readyTimeoutMs: 50,
    buildInitMessage: () => ({ type: "init" }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
    onReconnecting: (attempt, _max, target) => {
      reconnects.push({ attempt, kind: target.kind });
    },
    onFailover: ({ from, to, reason }) => {
      failovers.push({ from: from.kind, to: to.kind, reason });
    },
  });

  // Initial connection to voice-primary succeeds
  const connectPromise = connector.connect();
  sockets[0].emitOpen();
  await flush();
  sockets[0].emitJson({ type: "ready" });
  await connectPromise;
  assert.equal(connector.target?.kind, "voice");

  // Mid-session disconnect — triggers reconnect attempts
  sockets[0].emitClose();

  // Reconnect attempt 1: socket created to same target, but we let it close (fail)
  await waitFor(() => sockets.length >= 2, 2_000);
  assert.equal(sockets[1].url, "ws://voice-primary:8766");
  sockets[1].emitClose();

  // Reconnect attempt 2: socket created to same target again, also fails
  await waitFor(() => sockets.length >= 3, 2_000);
  assert.equal(sockets[2].url, "ws://voice-primary:8766");
  sockets[2].emitClose();

  // Both reconnect attempts exhausted → falls over to openai
  await waitFor(() => sockets.length >= 4, 2_000);
  assert.equal(sockets[3].url, "ws://openai-fallback:8767");
  sockets[3].emitOpen();
  await flush();
  sockets[3].emitJson({ type: "ready" });

  await waitFor(() => failovers.length === 1, 2_000);
  assert.equal(failovers[0].from, "voice");
  assert.equal(failovers[0].to, "openai");
  assert.equal(reconnects.length, 2);
  assert.equal(reconnects[0].attempt, 1);
  assert.equal(reconnects[1].attempt, 2);
});

test("RelayConnector reconnects to the same relay successfully without failover", async () => {
  const sockets: FakeSocket[] = [];
  const failovers: Array<{ from: string; to: string }> = [];

  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [
      { kind: "voice", url: "ws://voice-primary:8766" },
      { kind: "openai", url: "ws://openai-fallback:8767" },
    ],
    reconnectAttempts: 2,
    reconnectDelayMs: 1,
    buildInitMessage: () => ({ type: "init" }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
    onFailover: ({ from, to }) => {
      failovers.push({ from: from.kind, to: to.kind });
    },
  });

  const connectPromise = connector.connect();
  sockets[0].emitOpen();
  await flush();
  sockets[0].emitJson({ type: "ready" });
  await connectPromise;

  // Mid-session disconnect
  sockets[0].emitClose();

  // Reconnect attempt 1 succeeds — same target, no failover
  await waitFor(() => sockets.length >= 2, 2_000);
  assert.equal(sockets[1].url, "ws://voice-primary:8766");
  sockets[1].emitOpen();
  await flush();
  sockets[1].emitJson({ type: "ready" });
  await flush();

  assert.equal(connector.target?.kind, "voice");
  assert.equal(connector.isReady, true);
  assert.equal(failovers.length, 0);
});

test("RelayConnector reports permanent failure after all relay targets fail", async () => {
  const sockets: FakeSocket[] = [];
  let permanentFailure: Error | null = null;

  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [
      { kind: "voice", url: "ws://voice-primary:8766" },
      { kind: "openai", url: "ws://openai-fallback:8767" },
    ],
    buildInitMessage: () => ({ type: "init" }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
    onPermanentFailure: (error) => {
      permanentFailure = error;
    },
  });

  const connectPromise = connector.connect();
  sockets[0].emitError();
  await waitFor(() => sockets.length === 2);
  sockets[1].emitError();

  await assert.rejects(connectPromise);
  assert.ok(permanentFailure);
});
