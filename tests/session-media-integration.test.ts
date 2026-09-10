import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";

process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

test("real media routers merge checkpoints, preserve finals, recover storage and propagate failures", async (t) => {
  const originalFetch = globalThis.fetch;
  const first = { path: "session/2026-09-10T01-00-00-000Z-camera.jpg", url: "old", timestamp: "2026-09-10T01:00:00.000Z", type: "camera" as const };
  let row: Record<string, unknown> = { audioRecordingUrl: "session/audio.webm", audioRecordings: [], screenshots: [first], startedAt: "2026-09-10T01:00:00.000Z" };
  let readFailure = false, writeFailure = false, allowed = true, storageFailure = false;
  const writes: Record<string, unknown>[] = [];
  const storageRequests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "http://127.0.0.1:1", "Live network access forbidden");
    const path = url.pathname;
    if (path.includes("/storage/")) {
      storageRequests.push(path);
      if (storageFailure) return Response.json({ message: "storage unavailable" }, { status: 500 });
      if (path.endsWith("/list/screenshots")) return Response.json([{ name: "2026-09-10T01-01-00-000Z-screen.jpg" }]);
      if (path.endsWith("/list/recordings")) return Response.json([{ name: "audio.webm", created_at: "2026-09-10T01:00:00.000Z" }]);
      if (path.endsWith("/sign/screenshots")) {
        const body = JSON.parse(String(init?.body));
        return Response.json(body.paths.map((p: string) => ({ path: p, signedURL: `/object/sign/screenshots/${p}?token=fresh` })));
      }
      if (path.includes("/sign/recordings/")) return Response.json({ signedURL: `/object/sign/recordings/session/audio.webm?token=fresh` });
      throw new Error(`Unexpected storage request ${path}`);
    }
    if (path.endsWith("/sessions")) {
      if (init?.method === "PATCH") {
        if (writeFailure) return Response.json({ message: "write failed" }, { status: 500 });
        const body = JSON.parse(String(init.body)); writes.push(body); row = { ...row, ...body };
        return new Response(null, { status: 204 });
      }
      if (readFailure) return Response.json({ message: "read failed" }, { status: 500 });
      return Response.json({ ...row, interview: { title: "Test", projectId: "project", project: { organizationId: "org" } }, messages: [] });
    }
    if (path.endsWith("/messages")) return Response.json({ timestamp: row.startedAt });
    if (path.endsWith("/organization_members")) return Response.json(allowed ? { role: "OWNER" } : null);
    if (path.endsWith("/project_members")) return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    const { sessionRouter } = await import("../src/server/routers/session");
    const { analysisRouter } = await import("../src/server/routers/analysis");
    const supabase = createClient(process.env.SUPABASE_URL!, "test-key");
    const ctx = { supabase, user: { id: "user" } as User };
    const caller = sessionRouter.createCaller(ctx);
    const analysis = analysisRouter.createCaller(ctx);
    await t.test("empty and later checkpoints do not erase previous captures", async () => {
      await caller.saveRecording({ sessionId: "session", screenshots: [] });
      assert.deepEqual(row.screenshots, [first]);
      const next = { ...first, path: "session/next.jpg", url: "next", timestamp: "2026-09-10T01:01:00.000Z" };
      await caller.saveRecording({ sessionId: "session", screenshots: [next] });
      assert.deepEqual(row.screenshots, [first, next]);
    });
    await t.test("a late segment cannot overwrite the final primary URL or duration", async () => {
      await caller.saveRecording({ sessionId: "session", audioRecordingUrl: "session/audio-seg0.webm", audioDuration: 2 });
      assert.equal(row.audioRecordingUrl, "session/audio.webm");
      assert.equal(row.audioDuration, undefined);
    });
    await t.test("metadata read/write failures are surfaced instead of losing existing references", async () => {
      const count = writes.length;
      readFailure = true;
      await assert.rejects(caller.saveRecording({ sessionId: "session", screenshots: [] }), /read failed/);
      readFailure = false; writeFailure = true;
      await assert.rejects(caller.saveRecording({ sessionId: "session", screenshots: [] }), /write failed/);
      await assert.rejects(caller.complete({ id: "session" }), /write failed/);
      writeFailure = false;
      assert.equal(writes.length, count);
    });
    await t.test("review recovers final recording and screenshots and signs them", async () => {
      row = { ...row, audioRecordingUrl: "session/audio-seg0.webm", screenshots: [first] };
      const result = await analysis.getSessionSummary({ sessionId: "session" });
      assert.match(result.audioRecordingUrl!, /audio.webm\?token=fresh$/);
      assert.equal(result.audioRecordings.length, 1);
      assert.equal(result.screenshots?.length, 2);
      assert.ok(result.screenshots?.every(s => s.url.includes("token=fresh")));
    });
    await t.test("storage outages preserve saved references", async () => {
      storageFailure = true;
      const result = await analysis.getSessionSummary({ sessionId: "session" });
      assert.equal(result.audioRecordingUrl, row.audioRecordingUrl);
      assert.deepEqual(result.screenshots, [first]);
      storageFailure = false;
    });
    await t.test("denied access performs no storage operations", async () => {
      allowed = false;
      const count = storageRequests.length;
      await assert.rejects(analysis.getSessionSummary({ sessionId: "session" }), /not a member/);
      assert.equal(storageRequests.length, count);
    });
  } finally { globalThis.fetch = originalFetch; }
});
