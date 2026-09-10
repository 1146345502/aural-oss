import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";

// All HTTP requests are intercepted before importing server modules.
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const owner = "00000000-0000-4000-8000-000000000001";

test("REST feature contracts: authorization, ownership, previews, completion and read failures", async (t) => {
  const originalFetch = globalThis.fetch;
  let outside = false, missing = false, dbFailure = false, userMissing = false;
  let role = "OWNER";
  let calls: { method: string; input: unknown }[] = [];
  const requests: URL[] = [];
  const writes: { path: string; body: Record<string, unknown> | Record<string, unknown>[] }[] = [];
  let serviceFailure: Error | undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "http://127.0.0.1:1", "Live network access forbidden");
    requests.push(url);
    const path = url.pathname;
    if (["POST", "PATCH"].includes(init?.method ?? "") && !path.endsWith("/api_keys")) {
      writes.push({ path, body: JSON.parse(String(init?.body)) });
    }
    let data: unknown;
    if (path.includes("/auth/v1/admin/users/")) return Response.json(userMissing ? { message: "missing" } : { id: owner, email: "owner@example.com" }, { status: userMissing ? 404 : 200 });
    if (path.endsWith("/api_keys")) data = { userId: owner, isActive: true };
    else if (path.endsWith("/organization_members")) data = { workspaceId: "org", role };
    else if (path.endsWith("/projects")) data = [{ id: "project" }];
    else if (path.endsWith("/project_members")) data = null;
    else if (path.endsWith("/interviews")) data = { id: "interview", projectId: outside ? "outside" : "project" };
    else if (path.endsWith("/questions")) {
      if (init?.method === "POST") return Response.json(JSON.parse(String(init.body)));
      if (init?.method === "PATCH") return Response.json(JSON.parse(String(init.body)));
      data = url.searchParams.get("select")?.includes("interview:")
        ? { id: "question", interviewId: "interview", interview: { projectId: "project" } }
        : [{ id: "question", order: 0 }];
    }
    else if (/\/(sessions|prep_sessions|candidates)$/.test(path)) {
      if (dbFailure) return Response.json({ message: "Database unavailable" }, { status: 500 });
      if (path.endsWith("/candidates") && init?.method === "POST") return Response.json([{ id: "candidate", inviteToken: "personal token" }]);
      data = missing ? null : { id: "item", interviewId: "interview", status: "IN_PROGRESS", email: "candidate@example.com", inviteToken: "token", sessionId: null };
    } else throw new Error(`Unexpected request ${url}`);
    return Response.json(data);
  };
  try {
    const { analysisRouter } = await import("../src/server/routers/analysis");
    const { prepRouter } = await import("../src/server/routers/prep");
    const { sessionRouter } = await import("../src/server/routers/session");
    const result = { summary: "Existing report", audioRecordingUrl: null };
    const stub = (method: string, value: unknown) => async (input: unknown) => {
      calls.push({ method, input });
      if (method === "complete" && (input as { id?: string }).id === "fail") throw new Error("First item failed");
      if (serviceFailure) throw serviceFailure;
      return value;
    };
    // Test REST adapters separately from router internals covered by existing unit suites.
    t.mock.method(analysisRouter, "createCaller", (ctx: { user: { id: string } }) => {
      assert.equal(ctx.user.id, owner);
      return { getSessionSummary: stub("report", result) };
    });
    t.mock.method(prepRouter, "createCaller", () => ({ listSessions: stub("listPractices", { sessions: [{ id: "practice" }] }), getSessionReport: stub("practice", { session: { id: "practice" }, interview: {}, questions: [], attempts: [] }) }));
    t.mock.method(sessionRouter, "createCaller", () => ({ complete: stub("complete", { id: "item" }) }));
    const { GET: report } = await import("../src/app/api/v1/sessions/[id]/report/route");
    const { GET: practice } = await import("../src/app/api/v1/practices/[id]/route");
    const { GET: list } = await import("../src/app/api/v1/interviews/[id]/practices/route");
    const { POST: end } = await import("../src/app/api/v1/interviews/[id]/sessions/end/route");
    const { PATCH: candidate } = await import("../src/app/api/v1/interviews/[id]/candidates/[candidateId]/route");
    const params = { params: Promise.resolve({ id: "interview", candidateId: "item" }) };
    let key = 0;
    const req = (body?: unknown, query = "") => new Request(`http://localhost/test${query}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer dlv_contract_${key++}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await t.test("all new routes reject missing authentication without service work", async () => {
      for (const handler of [report, practice, list, end, candidate]) assert.equal((await handler(new Request("http://localhost/test"), params)).status, 401);
      assert.equal(calls.length, 0);
    });
    await t.test("report forwards existing report and retention without generating analysis", async () => {
      assert.deepEqual(await (await report(req(), params)).json(), { data: result });
      assert.deepEqual(calls.pop(), { method: "report", input: { sessionId: "interview" } });
    });
    await t.test("practice reads enforce owner filtering and preserve response envelopes", async () => {
      assert.equal((await practice(req(), params)).status, 200);
      const query = requests.find(u => u.pathname.endsWith("/prep_sessions"));
      assert.equal(query?.searchParams.get("userId"), `eq.${owner}`);
      assert.deepEqual(await (await list(req(), params)).json(), { data: [{ id: "practice" }] });
      assert.deepEqual(calls.at(-1), { method: "listPractices", input: { interviewId: "interview", limit: 100 } });
      for (const limit of [1, 500]) assert.equal((await list(req(undefined, `?limit=${limit}`), params)).status, 200);
      const before = calls.length;
      for (const limit of [0, 501, 1.5, "abc"]) assert.equal((await list(req(undefined, `?limit=${limit}`), params)).status, 400);
      assert.equal(calls.length, before);
    });
    await t.test("bulk preview has no effects; execution deduplicates and delegates completion", async () => {
      calls = [];
      for (const handler of [end]) {
        const preview = await handler(req({ ids: ["item", "item"] }), params);
        assert.deepEqual((await preview.json()).data, { dryRun: true, results: [{ id: "item", status: "eligible" }] });
      }
      assert.equal(calls.length, 0);
      for (const handler of [end]) assert.equal((await (await handler(req({ ids: ["item", "item"], dryRun: false }), params)).json()).data.results[0].status, "succeeded");
      assert.deepEqual(calls.map(c => c.method), ["complete"]);
      assert.deepEqual(calls[0].input, { id: "item" });
      const mixed = await end(req({ ids: ["fail", "item"], dryRun: false }), params);
      assert.deepEqual((await mixed.json()).data.results.map((r: { status: string }) => r.status), ["failed", "succeeded"], "A failed item must not stop later eligible items");
      serviceFailure = new Error("Completion failed");
      assert.equal((await (await end(req({ ids: ["item"], dryRun: false }), params)).json()).data.results[0].status, "failed");
      serviceFailure = undefined;
    });
    await t.test("invalid bodies and viewer writes fail before side effects", async () => {
      const before = calls.length;
      for (const handler of [end]) {
        for (const body of [null, {}, { ids: [] }, { ids: Array(101).fill("item") }, { ids: ["item"], dryRun: "false" }]) assert.equal((await handler(req(body), params)).status, 400);
        assert.equal((await handler(new Request("http://localhost/test", { method: "POST", headers: { authorization: `Bearer dlv_bad_${key++}` }, body: "{" }), params)).status, 400);
      }
      for (const body of [{}, { birthday: "2026-02-30" }, { email: "bad" }, { graduationYear: 1.5 }]) assert.equal((await candidate(req(body), params)).status, 400);
      role = "VIEWER";
      for (const handler of [end]) assert.equal((await handler(req({ ids: ["item"], dryRun: false }), params)).status, 403);
      role = "OWNER";
      assert.equal(calls.length, before);
    });
    await t.test("scope, missing records and database failures do not reach services", async () => {
      const before = calls.length;
      outside = true;
      for (const handler of [report, practice, list]) assert.equal((await handler(req(), params)).status, 403);
      outside = false; missing = true;
      for (const handler of [report, practice]) assert.equal((await handler(req(), params)).status, 404);
      assert.equal((await candidate(req({ email: null }), params)).status, 404);
      missing = false; dbFailure = true;
      for (const handler of [report, practice]) assert.equal((await handler(req(), params)).status, 500);
      dbFailure = false;
      assert.equal(calls.length, before);
    });
    await t.test("advanced question and candidate values reach the database without losing false or null", async () => {
      const { POST: createQuestions } = await import("../src/app/api/v1/interviews/[id]/questions/route");
      const { PATCH: updateQuestion } = await import("../src/app/api/v1/questions/[id]/route");
      const { POST: createCandidates } = await import("../src/app/api/v1/interviews/[id]/candidates/route");
      const details = { starterCode: { python: "pass" }, timeLimitSeconds: 60, allowFileUpload: false, allowedFileTypes: [], skipIf: false, description: null };
      assert.equal((await createQuestions(req({ text: "Implement", type: "CODING", ...details }), params)).status, 200);
      const created = (writes.at(-1)!.body as Record<string, unknown>[])[0];
      for (const [field, value] of Object.entries(details)) assert.deepEqual(created[field], value);
      assert.equal(created.interviewId, "interview");
      assert.equal((await updateQuestion(req(details), params)).status, 200);
      assert.deepEqual(writes.at(-1)!.body, details);
      assert.equal((await candidate(req({ school: "Example", birthday: null, graduationYear: 2025 }), params)).status, 200);
      assert.deepEqual(writes.at(-1)!.body, { school: "Example", birthday: null, graduationYear: 2025 });
      assert.equal(requests.at(-1)!.searchParams.get("interviewId"), "eq.interview");
      const response = await createCandidates(req({ name: "Candidate", school: "Example" }), params);
      assert.equal(response.status, 200);
      assert.match((await response.json()).data[0].inviteUrl, /\/i\/invite\/personal%20token$/);
      const before = writes.length;
      assert.equal((await updateQuestion(req({ timeLimitSeconds: -1 }), params)).status, 400);
      role = "VIEWER";
      assert.equal((await candidate(req({ school: "Denied" }), params)).status, 403);
      role = "OWNER";
      outside = true;
      assert.equal((await end(req({ ids: ["item"], dryRun: false }), params)).status, 403);
      outside = false;
      assert.equal(writes.length, before);
    });
    await t.test("caller failures map to REST status and hide unexpected error details", async () => {
      for (const [code, status] of [["FORBIDDEN", 403], ["NOT_FOUND", 404], ["CONFLICT", 409]] as const) {
        serviceFailure = new TRPCError({ code });
        assert.equal((await report(req(), params)).status, status);
      }
      serviceFailure = new Error("private provider secret");
      const response = await report(req(), params);
      assert.equal(response.status, 500);
      assert.ok(!(await response.text()).includes("private provider secret"));
      serviceFailure = undefined; userMissing = true;
      assert.equal((await report(req(), params)).status, 401);
    });
  } finally { globalThis.fetch = originalFetch; }
});
