import assert from "node:assert/strict";
import test from "node:test";

import { KimiProvider } from "../src/lib/ai/providers/kimi";

test("Kimi K2.6 non-streaming completions disable thinking", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.KIMI_API_KEY;
  let requestBody: Record<string, unknown> | null = null;

  process.env.KIMI_API_KEY = "test-key";
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: "test-completion",
        object: "chat.completion",
        created: 0,
        model: "kimi-k2.6",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: '{"summary":"ok"}' },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 4,
          total_tokens: 8,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const provider = new KimiProvider();
    const response = await provider.generateResponse({
      model: "kimi-k2.6",
      messages: [{ role: "user", content: "Return JSON" }],
      temperature: 0.3,
      maxTokens: 8192,
    });

    assert.equal(response.content, '{"summary":"ok"}');
    assert.ok(requestBody);
    const sentBody = requestBody as unknown as Record<string, unknown>;
    assert.equal(sentBody.model, "kimi-k2.6");
    assert.deepEqual(sentBody.thinking, { type: "disabled" });
    assert.equal(sentBody.max_tokens, 8192);
    assert.equal("temperature" in sentBody, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = originalApiKey;
  }
});
