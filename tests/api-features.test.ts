import assert from "node:assert/strict";
import test from "node:test";
import { apiCandidateDetailsSchema, apiQuestionDetailsSchema, bulkInterviewActionSchema } from "../src/lib/api-feature-schemas";

test("candidate and question profile fields validate without coercing wrong types", () => {
  assert.equal(apiCandidateDetailsSchema.safeParse({ birthday: "2026-02-30" }).success, false);
  assert.equal(apiCandidateDetailsSchema.safeParse({ graduationYear: "2025" }).success, false);
  assert.deepEqual(apiQuestionDetailsSchema.parse({ starterCode: { python: "pass" }, allowFileUpload: false }), { starterCode: { python: "pass" }, allowFileUpload: false });
  assert.equal(apiQuestionDetailsSchema.safeParse({ timeLimitSeconds: 0 }).success, false);
});
test("bulk calls default to preview, deduplicate, and bound batches", () => {
  assert.deepEqual(bulkInterviewActionSchema.parse({ ids: ["a", "a", "b"] }), { ids: ["a", "b"], dryRun: true });
  for (const body of [{ ids: [] }, { ids: [""] }, { ids: Array(101).fill("a") }, { ids: ["a"], dryRun: "false" }]) {
    assert.equal(bulkInterviewActionSchema.safeParse(body).success, false);
  }
});


test("OpenAPI references resolve and document the ported routes and writable fields", async () => {
  const { GET } = await import("../src/app/api/v1/openapi.json/route");
  const spec = await (await GET()).json();
  function inspect(value: unknown): void {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string" && child.startsWith("#/")) {
        let target: unknown = spec;
        for (const part of child.slice(2).split("/")) target = (target as Record<string, unknown>)?.[part];
        assert.ok(target, `Unresolved OpenAPI reference: ${child}`);
      } else inspect(child);
    }
  }
  inspect(spec);
  for (const path of ["/sessions/{id}/report", "/interviews/{id}/practices", "/practices/{id}", "/interviews/{id}/sessions/end", "/interviews/{id}/candidates/{candidateId}"]) assert.ok(spec.paths[path]);
  for (const name of ["Question", "QuestionCreate", "QuestionPatch"]) assert.ok(spec.components.schemas[name].properties.starterCode);
  for (const name of ["Candidate", "CandidateCreate"]) assert.ok(spec.components.schemas[name].properties.birthday);
  assert.equal(spec.paths["/interviews/{id}/sessions/end"].post.requestBody.content["application/json"].schema.properties.dryRun.default, true);
  assert.equal(spec.paths["/interviews/{id}/invites"], undefined);
});
