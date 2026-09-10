import { featurePaths, candidateFeatureProperties, questionFeatureProperties } from "@/lib/api-openapi-features";
/**
 * OpenAPI 3.1 document for the Developer API (`/api/v1`).
 * Served at GET /api/v1/openapi.json
 */

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Aural Developer API",
    version: "1.0.0",
    description: `This Developer API lets you create, configure, and manage AI-powered interviews programmatically—define templates, attach structured questions, publish shareable links, track candidate sessions, and retrieve transcripts and scoring-style outputs without using the web UI.

**Base URL:** Use the path \`/api/v1\` on your self-hosted deployment (for example \`https://your-host.example/api/v1\`).

**Authentication:** Send your developer key in the \`Authorization\` header as a Bearer token: \`Authorization: Bearer dlv_xxx\`. Keys are organization-scoped; list and mutation operations only apply to projects your key can access.

**Typical interview workflow**

To run an interview: 1. Create interview (\`POST /interviews\`), 2. Add questions (\`POST /interviews/{id}/questions\`), 3. Publish (\`POST /interviews/{id}/publish\`), 4. Share the URL, 5. Poll sessions (\`GET /interviews/{id}/sessions\`), 6. Get results (\`GET /sessions/{id}\`).`,
  },
  jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
  servers: [
    {
      url: "/api/v1",
      description: "Self-hosted (relative to your deployment origin)",
    },
  ],
  tags: [
    { name: "Interviews", description: "Interview templates and publishing." },
    { name: "Questions", description: "Questions attached to an interview." },
    { name: "Sessions", description: "Completed or in-progress interview sessions." },
    { name: "Candidates", description: "Invited candidates and invite links." },
    { name: "Practices", description: "Your practice sessions and reports." },
    { name: "Usage", description: "Usage snapshot for the organization tied to the API key." },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    ...featurePaths,
    "/interviews": {
      get: {
        tags: ["Interviews"],
        summary: "List interviews",
        description:
          "Cursor-paginated list of interviews in accessible projects. Each item may include `_count` for question and session totals.",
        operationId: "listInterviews",
        parameters: [
          {
            name: "cursor",
            in: "query",
            description:
              "Opaque cursor from the previous response (`cursor` field). Uses the interview `id` of the last item for stable pagination.",
            schema: { type: "string", example: "clx9abc123" },
            "x-llm-hint":
              "Pass the `cursor` value returned from the prior page; omit on the first request.",
          },
          {
            name: "limit",
            in: "query",
            description: "Page size (1–100). Defaults to 20.",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20, example: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated interviews",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "cursor"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/InterviewListItem" } },
                    cursor: {
                      type: ["string", "null"],
                      description: "Next page cursor, or null when there is no next page.",
                      example: "clx9def456",
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      post: {
        tags: ["Interviews"],
        summary: "Create interview",
        description:
          "Creates a new interview in the API key user's primary accessible project. `title` is required; other fields use server defaults when omitted.",
        operationId: "createInterview",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InterviewCreate" },
            },
          },
        },
        responses: {
          "200": {
            description: "Created interview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { $ref: "#/components/schemas/Interview" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/interviews/{id}": {
      get: {
        tags: ["Interviews"],
        summary: "Get interview with questions",
        description:
          "Returns the interview row, nested `questions` ordered by `order`, and `_count.sessions`.",
        operationId: "getInterview",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        responses: {
          "200": {
            description: "Interview detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: { $ref: "#/components/schemas/InterviewWithQuestions" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      patch: {
        tags: ["Interviews"],
        summary: "Update interview",
        description: "Partial update. Only fields present in the body are changed.",
        operationId: "updateInterview",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InterviewPatch" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated interview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { $ref: "#/components/schemas/Interview" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Interviews"],
        summary: "Archive interview",
        description: "Soft-archives by setting `isActive` to false.",
        operationId: "archiveInterview",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        responses: {
          "200": {
            description: "Archive confirmation",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "object",
                      required: ["id", "archived"],
                      properties: {
                        id: { type: "string", example: "clx9abc123" },
                        archived: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/interviews/{id}/publish": {
      post: {
        tags: ["Interviews"],
        summary: "Publish interview",
        description:
          "Activates the interview, disables invite-only requirement, ensures a `publicSlug`, and returns the public candidate URL.",
        operationId: "publishInterview",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        responses: {
          "200": {
            description: "Shareable link",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "object",
                      required: ["id", "publicSlug", "url"],
                      properties: {
                        id: { type: "string", example: "clx9abc123" },
                        publicSlug: { type: "string", example: "xK9mP2nQaL" },
                        url: {
                          type: "string",
                          format: "uri",
                          example: "https://your-host.example/i/xK9mP2nQaL",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/interviews/{id}/questions": {
      get: {
        tags: ["Questions"],
        summary: "List questions",
        operationId: "listQuestions",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        responses: {
          "200": {
            description: "Ordered questions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Question" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      post: {
        tags: ["Questions"],
        summary: "Add questions",
        description:
          "Accepts a single question object or an array. Request uses `required` and `followUpEnabled`; stored fields are `isRequired` and `probeOnShort`.",
        operationId: "createQuestions",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/QuestionCreate" },
                  {
                    type: "array",
                    minItems: 1,
                    items: { $ref: "#/components/schemas/QuestionCreate" },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Created questions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Question" } },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/questions/{id}": {
      patch: {
        tags: ["Questions"],
        summary: "Update question",
        operationId: "updateQuestion",
        parameters: [{ $ref: "#/components/parameters/QuestionId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/QuestionPatch" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated question",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { $ref: "#/components/schemas/Question" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      delete: {
        tags: ["Questions"],
        summary: "Delete question",
        operationId: "deleteQuestion",
        parameters: [{ $ref: "#/components/parameters/QuestionId" }],
        responses: {
          "200": {
            description: "Deletion confirmation",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "object",
                      required: ["id", "deleted"],
                      properties: {
                        id: { type: "string" },
                        deleted: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/interviews/{id}/sessions": {
      get: {
        tags: ["Sessions"],
        summary: "List sessions",
        description:
          "Cursor-paginated sessions for an interview, newest first. Each row includes `_count.messages`.",
        operationId: "listSessions",
        parameters: [
          { $ref: "#/components/parameters/InterviewId" },
          {
            name: "cursor",
            in: "query",
            description: "Session id from the previous page; must belong to this interview.",
            schema: { type: "string" },
            "x-llm-hint": "Use the last session `id` from `data` when `cursor` is non-null in the prior response.",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated sessions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "cursor"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Session" } },
                    cursor: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/sessions/{id}": {
      get: {
        tags: ["Sessions"],
        summary: "Get session with transcript and results",
        description:
          "Returns messages (transcript), summary fields, and nested interview metadata (`id`, `title`, `objective`).",
        operationId: "getSession",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: {
          "200": {
            description: "Session detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: { $ref: "#/components/schemas/SessionWithResults" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/interviews/{id}/candidates": {
      get: {
        tags: ["Candidates"],
        summary: "List candidates",
        operationId: "listCandidates",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        responses: {
          "200": {
            description: "Candidates for the interview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Candidate" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
      post: {
        tags: ["Candidates"],
        summary: "Create candidates",
        description:
          "Bulk create (1–500 per request). Response rows include `inviteUrl` for each token.",
        operationId: "createCandidates",
        parameters: [{ $ref: "#/components/parameters/InterviewId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/CandidateCreate" },
                  {
                    type: "array",
                    minItems: 1,
                    maxItems: 500,
                    items: { $ref: "#/components/schemas/CandidateCreate" },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Created candidates with invite URLs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CandidateWithInviteUrl" },
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/usage": {
      get: {
        tags: ["Usage"],
        summary: "Current usage snapshot",
        description: "Basic counts for the organization tied to the API key (self-hosted; limits are uncapped).",
        operationId: "getUsage",
        responses: {
          "200": {
            description: "Usage snapshot",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { $ref: "#/components/schemas/Usage" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Aural developer key",
        description:
          "Use a developer API key with the `dlv_` prefix. Example: `Authorization: Bearer dlv_your_key_here`. Keys are issued from your deployment's settings UI; treat them like secrets.",
      },
    },
    parameters: {
      InterviewId: {
        name: "id",
        in: "path",
        required: true,
        description: "Interview id (ULID/CUID-style string from create/list).",
        schema: { type: "string", example: "clx9abc123" },
      },
      QuestionId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", example: "clx9qst456" },
      },
      SessionId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", example: "clx9ses789" },
      },
    },
    responses: {
      BadRequest: {
        description: "Malformed input or validation error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: { code: "BAD_REQUEST", message: "title is required." } },
          },
        },
      },
      Unauthorized: {
        description: "Missing or invalid API key",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "UNAUTHORIZED",
                message: "Missing or invalid API key. Use: Authorization: Bearer dlv_xxx",
              },
            },
          },
        },
      },
      Forbidden: {
        description: "Authenticated but not allowed to access the resource",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "Resource not found or inaccessible",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: { code: "NOT_FOUND", message: "Interview not found." } },
          },
        },
      },
      InternalError: {
        description: "Unexpected server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: { code: "INTERNAL_ERROR", message: "…" } },
          },
        },
      },
    },
    schemas: {
      AssessmentCriterion: {
        type: "object",
        required: ["name", "description"],
        properties: {
          name: { type: "string", example: "Communication" },
          description: { type: "string", example: "Clarity and structure of answers." },
        },
        "x-llm-hint": "Use short names and concrete descriptions the AI can score against.",
      },
      Interview: {
        type: "object",
        description: "Interview template row as returned by the API after create/update.",
        properties: {
          id: { type: "string", example: "clx9abc123" },
          title: { type: "string", example: "Senior Backend Engineer" },
          description: { type: ["string", "null"], example: "45-minute technical screen." },
          objective: { type: ["string", "null"], example: "Assess system design and debugging." },
          assessmentCriteria: {
            type: ["array", "null"],
            items: { $ref: "#/components/schemas/AssessmentCriterion" },
            "x-llm-hint": "Structured rubric; omit or null to clear when patching.",
          },
          chatEnabled: { type: "boolean", example: true },
          voiceEnabled: { type: "boolean", example: false },
          videoEnabled: { type: "boolean", example: false },
          aiName: { type: "string", example: "Aural" },
          aiTone: {
            type: "string",
            enum: ["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"],
            example: "PROFESSIONAL",
          },
          followUpDepth: {
            type: "string",
            enum: ["LIGHT", "MODERATE", "DEEP"],
            example: "MODERATE",
          },
          language: { type: "string", example: "en" },
          timeLimitMinutes: { type: ["integer", "null"], minimum: 1, example: 45 },
          antiCheatingEnabled: { type: "boolean", example: false },
          projectId: { type: "string" },
          userId: { type: "string" },
          requireInvite: { type: "boolean", example: true },
          publicSlug: { type: ["string", "null"], example: "xK9mP2nQaL" },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        additionalProperties: true,
      },
      InterviewListItem: {
        allOf: [
          { $ref: "#/components/schemas/Interview" },
          {
            type: "object",
            properties: {
              _count: {
                type: "object",
                properties: {
                  questions: { type: "integer", example: 5 },
                  sessions: { type: "integer", example: 12 },
                },
                description: "Aggregates from related rows (not full embeds).",
              },
            },
          },
        ],
      },
      InterviewWithQuestions: {
        allOf: [
          { $ref: "#/components/schemas/Interview" },
          {
            type: "object",
            properties: {
              questions: { type: "array", items: { $ref: "#/components/schemas/Question" } },
              _count: {
                type: "object",
                properties: { sessions: { type: "integer", example: 3 } },
              },
            },
          },
        ],
      },
      InterviewCreate: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", minLength: 1, example: "Product Manager Screen" },
          description: { type: "string", example: "Focus on prioritization and metrics." },
          objective: { type: "string", example: "Evaluate decision-making under ambiguity." },
          assessmentCriteria: {
            type: "array",
            items: { $ref: "#/components/schemas/AssessmentCriterion" },
          },
          chatEnabled: { type: "boolean", default: true },
          voiceEnabled: { type: "boolean", default: false },
          videoEnabled: { type: "boolean", default: false },
          aiName: { type: "string", default: "Aural", example: "Alex" },
          aiTone: {
            type: "string",
            enum: ["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"],
            default: "PROFESSIONAL",
          },
          followUpDepth: {
            type: "string",
            enum: ["LIGHT", "MODERATE", "DEEP"],
            default: "MODERATE",
          },
          language: { type: "string", default: "en", example: "en" },
          timeLimitMinutes: {
            type: "integer",
            minimum: 1,
            example: 30,
            "x-llm-hint": "Omit for no time limit (null in storage).",
          },
          antiCheatingEnabled: { type: "boolean", default: false },
        },
        additionalProperties: false,
      },
      InterviewPatch: {
        type: "object",
        description: "Include only fields to change. Empty bodies are rejected.",
        properties: {
          title: { type: "string", minLength: 1 },
          description: { type: ["string", "null"] },
          objective: { type: ["string", "null"] },
          assessmentCriteria: {
            type: ["array", "null"],
            items: { $ref: "#/components/schemas/AssessmentCriterion" },
          },
          chatEnabled: { type: "boolean" },
          voiceEnabled: { type: "boolean" },
          videoEnabled: { type: "boolean" },
          aiName: { type: ["string", "null"] },
          aiTone: { type: "string", enum: ["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"] },
          followUpDepth: { type: "string", enum: ["LIGHT", "MODERATE", "DEEP"] },
          language: { type: ["string", "null"] },
          timeLimitMinutes: { type: ["integer", "null"], minimum: 1 },
          antiCheatingEnabled: { type: "boolean" },
        },
        minProperties: 1,
        additionalProperties: false,
      },
      QuestionType: {
        type: "string",
        enum: [
          "OPEN_ENDED",
          "SINGLE_CHOICE",
          "MULTIPLE_CHOICE",
          "CODING",
          "WHITEBOARD",
          "RESEARCH",
        ],
        example: "OPEN_ENDED",
      },
      Question: {
        type: "object",
        description: "Persisted question; API responses use `isRequired` and `probeOnShort`.",
        properties: {
          ...questionFeatureProperties,
          id: { type: "string", example: "clx9qst456" },
          interviewId: { type: "string", example: "clx9abc123" },
          order: { type: "integer", minimum: 0, example: 0 },
          text: { type: "string", example: "Describe a recent trade-off you owned end-to-end." },
          type: { $ref: "#/components/schemas/QuestionType" },
          isRequired: { type: "boolean", example: true },
          options: {
            type: ["array", "null"],
            items: { type: "string" },
            example: ["Option A", "Option B"],
            "x-llm-hint": "Required for choice-style types; use null when not applicable.",
          },
          probeOnShort: {
            type: "boolean",
            example: true,
            description: "Maps from request field `followUpEnabled`.",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        additionalProperties: true,
      },
      QuestionCreate: {
        type: "object",
        required: ["text"],
        properties: {
          ...questionFeatureProperties,
          text: { type: "string", minLength: 1 },
          type: { $ref: "#/components/schemas/QuestionType", default: "OPEN_ENDED" },
          order: {
            type: "integer",
            minimum: 0,
            "x-llm-hint": "Non-negative; omit to append after the current max order.",
          },
          required: { type: "boolean", default: true },
          options: { type: "array", items: { type: "string" } },
          followUpEnabled: { type: "boolean", default: true },
        },
        additionalProperties: false,
      },
      QuestionPatch: {
        type: "object",
        minProperties: 1,
        properties: {
          ...questionFeatureProperties,
          text: { type: "string", minLength: 1 },
          type: { $ref: "#/components/schemas/QuestionType" },
          order: { type: "integer", minimum: 0 },
          required: { type: "boolean" },
          options: { type: ["array", "null"], items: { type: "string" } },
          followUpEnabled: { type: "boolean" },
        },
        additionalProperties: false,
      },
      Session: {
        type: "object",
        description: "Interview session row. List responses include `_count.messages` instead of embedding messages.",
        properties: {
          id: { type: "string", example: "clx9ses789" },
          status: { type: "string", example: "COMPLETED" },
          participantName: { type: ["string", "null"], example: "Jordan Lee" },
          participantEmail: { type: ["string", "null"], example: "jordan@example.com" },
          summary: { type: ["string", "null"] },
          insights: { type: ["array", "null"], items: {} },
          themes: { type: ["array", "null"], items: {} },
          sentiment: { type: ["string", "null"] },
          totalDurationSeconds: { type: ["integer", "null"], example: 1842 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          _count: {
            type: "object",
            properties: { messages: { type: "integer", example: 42 } },
            description: "Present on `GET /interviews/{id}/sessions` pages.",
          },
        },
        additionalProperties: true,
        "x-llm-hint":
          "`insights` and `themes` are JSON-friendly structures from the product; treat as opaque summary data unless documented elsewhere.",
      },
      Message: {
        type: "object",
        required: ["id", "role", "content", "timestamp"],
        properties: {
          id: { type: "string", example: "clx9msg001" },
          role: { type: "string", example: "assistant" },
          content: { type: "string", example: "Thanks for sharing. Can you elaborate on the metrics?" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      SessionWithResults: {
        allOf: [
          { $ref: "#/components/schemas/Session" },
          {
            type: "object",
            required: ["messages", "interview"],
            properties: {
              messages: { type: "array", items: { $ref: "#/components/schemas/Message" } },
              interview: {
                type: "object",
                required: ["id", "title", "objective"],
                properties: {
                  id: { type: "string", example: "clx9abc123" },
                  title: { type: "string", example: "Senior Backend Engineer" },
                  objective: {
                    type: ["string", "null"],
                    example: "Assess debugging and system design.",
                  },
                },
              },
              summary: { type: ["string", "null"], example: "Strong ownership; dig deeper on scale." },
              sentiment: { type: ["string", "null"], example: "positive" },
            },
            "x-llm-hint":
              "Detail shape returned by `GET /sessions/{id}`: transcript in `messages`, plus nested `interview` metadata. No `_count` in this response.",
          },
        ],
      },
      Candidate: {
        type: "object",
        properties: {
          ...candidateFeatureProperties,
          id: { type: "string", example: "clx9cand001" },
          name: { type: "string", example: "Sam Rivera" },
          email: { type: ["string", "null"], example: "sam@example.com" },
          phone: { type: ["string", "null"], example: "+1-415-555-0100" },
          notes: { type: ["string", "null"], example: "Referral from Jane." },
          inviteToken: { type: "string", example: "V1StGXR8_Z5jdHi6B" },
          sessionId: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
        },
        additionalProperties: true,
      },
      CandidateCreate: {
        type: "object",
        properties: {
          ...candidateFeatureProperties,
          name: { type: "string", example: "Sam Rivera", default: "" },
          email: { type: "string", example: "sam@example.com" },
          phone: { type: "string", example: "+1-415-555-0100" },
          notes: { type: "string", example: "Internal mobility candidate." },
        },
        additionalProperties: false,
        "x-llm-hint": "Name and email may be empty strings; server normalizes email to lowercase.",
      },
      CandidateWithInviteUrl: {
        allOf: [
          { $ref: "#/components/schemas/Candidate" },
          {
            type: "object",
            properties: {
              inviteUrl: {
                type: "string",
                format: "uri",
                example: "https://your-host.example/i/invite/V1StGXR8_Z5jdHi6B",
              },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      Usage: {
        type: "object",
        required: ["plan", "templates", "session_hours", "ai_tokens", "seats"],
        properties: {
          plan: {
            type: "string",
            example: "self-hosted",
            description: "Deployment mode identifier.",
          },
          templates: {
            type: "object",
            required: ["used", "limit"],
            properties: {
              used: { type: "integer", example: 7 },
              limit: { type: ["integer", "null"], example: null, description: "Always null in self-hosted (uncapped)." },
            },
          },
          session_hours: {
            type: "object",
            required: ["used", "limit"],
            properties: {
              used: { type: "number", example: 0 },
              limit: { type: ["number", "null"], example: null },
            },
            "x-llm-hint": "Self-hosted snapshot; session hours usage is not enforced via this endpoint.",
          },
          ai_tokens: {
            type: "object",
            required: ["used", "limit"],
            properties: {
              used: { type: "number", example: 0 },
              limit: { type: ["number", "null"], example: null },
            },
          },
          seats: {
            type: "object",
            required: ["used", "limit"],
            properties: {
              used: { type: "integer", example: 4 },
              limit: { type: ["number", "null"], example: null },
            },
          },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "BAD_REQUEST" },
              message: { type: "string", example: "Invalid JSON body." },
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
} as const;

export async function GET() {
  return Response.json(spec, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
