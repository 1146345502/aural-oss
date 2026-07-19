import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReaderUrl,
  fetchUrlWithReaderFallback,
  normalizeReaderText,
} from "../src/lib/url-fetch";

const TEST_URL =
  "https://openai.com/careers/technical-deployment-lead-singapore-singapore/";

test("URL fetch retries Cloudflare 403 responses through the reader", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });

    if (calls.length === 1) {
      return new Response("challenge", {
        status: 403,
        headers: { "cf-mitigated": "challenge" },
      });
    }

    return new Response(
      [
        "Title: Technical Deployment Lead - Singapore",
        "",
        `URL Source: ${TEST_URL}`,
        "",
        "Markdown Content:",
        "About the Role",
        "",
        "Own technical delivery end-to-end.",
      ].join("\n"),
      { status: 200, headers: { "Content-Type": "text/plain" } },
    );
  };

  const result = await fetchUrlWithReaderFallback(TEST_URL, {
    fetchImpl: fetchImpl as typeof fetch,
    readerApiKey: "",
  });

  assert.equal(result.usedReaderFallback, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, TEST_URL);
  assert.equal(calls[1]?.url, buildReaderUrl(TEST_URL));
  const readerHeaders = new Headers(calls[1]?.init?.headers);
  assert.equal(readerHeaders.get("X-Engine"), "browser");
  assert.equal(readerHeaders.has("Authorization"), false);
  assert.match(await result.response.text(), /^About the Role/);
});

test("URL fetch keeps successful direct responses", async () => {
  let callCount = 0;
  const fetchImpl = async (): Promise<Response> => {
    callCount += 1;
    return new Response("<main>Job description</main>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  };

  const result = await fetchUrlWithReaderFallback(TEST_URL, {
    fetchImpl: fetchImpl as typeof fetch,
    readerApiKey: "",
  });

  assert.equal(result.usedReaderFallback, false);
  assert.equal(callCount, 1);
  assert.equal(await result.response.text(), "<main>Job description</main>");
});

test("reader metadata is removed and target errors are preserved", () => {
  assert.deepEqual(
    normalizeReaderText(
      "Title: Example\n\nURL Source: https://example.com\n\nMarkdown Content:\nJD text",
    ),
    { text: "JD text", targetErrorStatus: null },
  );

  assert.deepEqual(
    normalizeReaderText(
      "Warning: Target URL returned error 404: Not Found\n\nMarkdown Content:\nMissing",
    ),
    { text: "", targetErrorStatus: 404 },
  );
});
