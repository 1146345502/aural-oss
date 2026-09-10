export const candidateFeatureProperties = {
  gender: { type: ["string", "null"] }, birthday: { type: ["string", "null"], format: "date" },
  education: { type: ["string", "null"] }, school: { type: ["string", "null"] },
  major: { type: ["string", "null"] }, graduationYear: { type: ["integer", "null"] },
  workExperience: { type: ["string", "null"] },
};
export const questionFeatureProperties = {
  description: { type: ["string", "null"] },
  starterCode: { type: ["object", "null"], additionalProperties: { type: "string" }, description: "Language-to-source mapping." },
  validationRules: {}, followUpPrompts: {}, showIf: {}, skipIf: {},
  probeThreshold: { type: ["number", "null"] },
  timeLimitSeconds: { type: ["integer", "null"], minimum: 1 },
  allowFileUpload: { type: "boolean" }, allowedFileTypes: { type: "array", items: { type: "string" } },
};
const id = { name: "id", in: "path", required: true, schema: { type: "string" } };
const object = { type: "object", additionalProperties: true };
const reportData = { ...object, properties: {
  interviewTitle: { type: "string" }, interviewObjective: { type: ["string", "null"] },
  participantName: { type: ["string", "null"] }, participantEmail: { type: ["string", "null"] },
  status: { type: "string" }, createdAt: { type: "string", format: "date-time" },
  totalDurationSeconds: { type: ["number", "null"] }, summary: {}, insights: {}, themes: {}, sentiment: {},
  messages: { type: "array", items: { $ref: "#/components/schemas/Message" } },
  audioRecordingUrl: { type: ["string", "null"] }, audioRecordings: { type: ["array", "null"], items: object },
  audioDuration: { type: ["number", "null"] }, screenshots: { type: ["array", "null"], items: object },
  antiCheatingLog: { type: ["array", "null"], items: object },
} };
function responses(schema: object) {
  return {
    "200": { description: "Success; inspect per-item statuses for bulk requests.", content: { "application/json": { schema: { type: "object", required: ["data"], properties: { data: schema } } } } },
    "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" }, "404": { $ref: "#/components/responses/NotFound" },
    "429": { description: "API key rate limit exceeded." }, "500": { $ref: "#/components/responses/InternalError" },
  };
}
function bulk(operationId: string, summary: string, description: string) {
  return { post: {
    tags: ["Interviews"], operationId, summary, description, parameters: [id],
    requestBody: { required: true, content: { "application/json": { schema: {
      type: "object", required: ["ids"], properties: {
        ids: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", minLength: 1 }, description: "Duplicate IDs are processed once." },
        dryRun: { type: "boolean", default: true, description: "Preview by default. Set false only after reviewing the eligible records." },
      },
    } } } },
    responses: responses({ type: "object", required: ["dryRun", "results"], properties: {
      dryRun: { type: "boolean" }, results: { type: "array", items: { type: "object", required: ["id", "status"], properties: {
        id: { type: "string" }, status: { type: "string", enum: ["eligible", "skipped", "succeeded", "failed"] }, reason: { type: "string" },
      } } },
    } }),
  } };
}
export const featurePaths = {
  "/interviews/{id}/sessions/end": bulk("endInterviewSessions", "Preview or end interview sessions", "ids are session IDs. Only IN_PROGRESS sessions in this interview are eligible. Marks sessions completed using the same duration logic as the app. Does not generate a report. MEMBER role or higher required. Revalidates each record on execution; already completed sessions are skipped."),
  "/sessions/{id}/report": { get: {
    tags: ["Sessions"], operationId: "getSessionReport", summary: "Read report and media", parameters: [id],
    description: "Reads existing report fields, transcript, antiCheatingLog, audioRecordings, screenshots. Refreshes signed media URLs as on the dashboard. Does not generate missing AI reports. URLs are temporary; do not store as permanent media identifiers.",
    responses: responses(reportData),
  } },
  "/interviews/{id}/practices": { get: {
    tags: ["Practices"], operationId: "listPracticeSessions", summary: "List the key owner's practice sessions", parameters: [id, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }],
    description: "Returns the API key owner's practice summaries in this accessible interview, newest first. Bounded list with no cursor. Practice sessions are separate from candidate interviews and do not consume interview session hours.",
    responses: responses({ type: "array", items: object }),
  } },
  "/practices/{id}": { get: {
    tags: ["Practices"], operationId: "getPracticeReport", summary: "Read the key owner's practice report", parameters: [id],
    description: "Returns session, interview, questions, and attempts with feedback, scores, and retained answer audio. Owner-only and project-scoped. Does not create attempts, grade answers, or generate AI feedback.",
    responses: responses({ ...object, properties: {
      session: object, interview: object, questions: { type: "array", items: object },
      attempts: { type: "array", items: { ...object, properties: {
        id: { type: "string" }, questionId: { type: "string" }, answerText: { type: "string" },
        score: { type: ["number", "null"] }, feedback: {}, followUp: {},
        audioUrl: { type: ["string", "null"] }, audioDurationSeconds: { type: ["number", "null"] },
      } } },
    } }),
  } },
  "/interviews/{id}/candidates/{candidateId}": { patch: {
    tags: ["Candidates"], operationId: "updateCandidate", summary: "Update candidate profile", parameters: [id, { ...id, name: "candidateId" }],
    requestBody: { required: true, content: { "application/json": { schema: { type: "object", minProperties: 1, properties: {
      ...candidateFeatureProperties, name: { type: "string", minLength: 1 }, email: { type: ["string", "null"], format: "email" }, phone: { type: ["string", "null"] }, notes: { type: ["string", "null"] },
    } } } } }, responses: responses({ $ref: "#/components/schemas/Candidate" }),
  } },
};
