import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

test("practice feedback confirms only saved attempts and reports failed inserts in the stream", async (t) => {
  process.env.SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.OPENAI_API_KEY = "test-key";
  const requestHeaders = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
  t.mock.method(requestHeaders, "headers", async () => new Headers({ authorization: "Bearer test-session-token" }));
  const originalFetch = globalThis.fetch;
  let outcome: "saved" | "error" | "missing" = "saved";
  let inserts = 0;
  let activityUpdates = 0;
  let externalRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== "http://127.0.0.1:1") externalRequests++;
    assert.equal(url.origin, "http://127.0.0.1:1", "Live network and LLM calls are forbidden");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "owner", email: "owner@example.com" });
    if (url.pathname.endsWith("/prep_sessions")) {
      if (init?.method === "PATCH") {
        activityUpdates++;
        return new Response(null, { status: 204 });
      }
      return Response.json({ id: "session", interviewId: "interview", userId: "owner", status: "IN_PROGRESS" });
    }
    if (url.pathname.endsWith("/interviews")) return Response.json({ id: "interview", userId: "owner", projectId: null, title: "Practice", language: "en", followUpDepth: "LIGHT" });
    if (url.pathname.endsWith("/questions")) return Response.json({ id: "question", text: "How do you test software?", description: null, type: "OPEN_ENDED", options: null });
    if (url.pathname.endsWith("/prep_attempts")) {
      if (init?.method !== "POST") return Response.json([]);
      inserts++;
      const attempt = JSON.parse(String(init.body));
      assert.equal(attempt.sessionId, "session");
      assert.equal(attempt.userId, "owner");
      assert.equal(attempt.answerText, "mic test");
      if (outcome === "error") return Response.json({ code: "42501", message: "Insert denied" }, { status: 403 });
      return Response.json(outcome === "missing" ? null : { id: "attempt", createdAt: "2026-10-12T00:00:00Z" });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  try {
    const { POST } = await import("../src/app/api/prep/feedback/route");
    for (const result of ["saved", "error", "missing"] as const) {
      await t.test(result, async () => {
        outcome = result;
        inserts = activityUpdates = 0;
        const response = await POST(new Request("http://localhost/api/prep/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The short-answer path produces real feedback without an LLM request.
          body: JSON.stringify({ sessionId: "session", questionId: "question", answerText: "mic test", inputMode: "TEXT", practiceMode: true }),
        }));
        assert.equal(response.status, 200);
        const stream = await response.text();
        const events = stream.split("\n").filter(line => line.startsWith("data: ") && line !== "data: [DONE]")
          .map(line => JSON.parse(line.slice(6)));
        assert.equal(inserts, 1);
        assert.equal(externalRequests, 0);
        assert.ok(events.some(event => event.feedback), "Feedback remains available even if saving fails");
        assert.ok(stream.includes("data: [DONE]"), "The stream must finish after reporting the result");
        if (result === "saved") {
          assert.deepEqual(events.filter(event => event.type === "persisted"), [{ type: "persisted", attemptId: "attempt", audioCreatedAt: "2026-10-12T00:00:00Z" }]);
          assert.equal(events.some(event => event.type === "persist_warning"), false);
          assert.equal(activityUpdates, 1);
        } else {
          assert.equal(events.some(event => event.type === "persisted"), false, "Never claim that an unsaved attempt was persisted");
          assert.deepEqual(events.filter(event => event.type === "persist_warning"), [{ type: "persist_warning", message: "Feedback shown but saving the attempt failed." }]);
          assert.equal(activityUpdates, 0);
        }
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
