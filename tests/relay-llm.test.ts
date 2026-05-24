import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import * as relayLlm from "../server/relay-llm";

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const v = vars[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  relayLlm.resetRelayLlmCacheForTests();
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      const v = prev[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    relayLlm.resetRelayLlmCacheForTests();
  }
}

afterEach(() => {
  relayLlm.resetRelayLlmCacheForTests();
});

test("default primary is gemini-3.1-flash-lite with abab6.5s-chat fallback when MiniMax key set", () => {
  withEnv(
    {
      RELAY_LLM_MODEL: undefined,
      GEMINI_API_KEY: "g-test",
      MINIMAX_API_KEY: "m-test",
      MINIMAX_BASE_URL: "https://api.minimaxi.com/v1",
    },
    () => {
      assert.equal(relayLlm.getRelayLlmModel(), "gemini-3.1-flash-lite");
      assert.equal(relayLlm.getRelayLlmFallbackModel(), "abab6.5s-chat");
    },
  );
});

test("no fallback when primary is already abab6.5s-chat on MiniMax", () => {
  withEnv(
    {
      RELAY_LLM_MODEL: "abab6.5s-chat",
      RELAY_LLM_API_KEY: "m-test",
      RELAY_LLM_BASE_URL: "https://api.minimaxi.com/v1",
      RELAY_LLM_PROVIDER: "openai",
      MINIMAX_API_KEY: "m-test",
    },
    () => {
      assert.equal(relayLlm.getRelayLlmModel(), "abab6.5s-chat");
      assert.equal(relayLlm.getRelayLlmFallbackModel(), null);
    },
  );
});

test("no fallback without MINIMAX_API_KEY", () => {
  withEnv(
    {
      GEMINI_API_KEY: "g-test",
      MINIMAX_API_KEY: undefined,
    },
    () => {
      assert.equal(relayLlm.getRelayLlmFallbackModel(), null);
    },
  );
});
