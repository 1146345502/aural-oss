# Developer API additions

Use your deployment's `/api/v1` base URL and `Authorization: Bearer dlv_...`. The complete schema is served at `/api/v1/openapi.json`.

| Method | Path | Behavior |
| --- | --- | --- |
| PATCH | `/interviews/{id}/candidates/{candidateId}` | Update name, email, phone, notes, and profile fields; requires MEMBER or higher. |
| GET | `/sessions/{id}/report` | Read existing analysis, transcript, screenshots, and recordings with refreshed signed URLs. Does not generate analysis. |
| GET | `/interviews/{id}/practices?limit=100` | List the key owner's practice sessions; limit 1–500. |
| GET | `/practices/{id}` | Read the key owner's practice report, questions, and attempts. |
| POST | `/interviews/{id}/sessions/end` | Preview or complete selected in-progress sessions; requires MEMBER or higher. |

Every endpoint enforces the key's project scope. Practice reports also enforce ownership. Signed media URLs expire; retain stable session IDs and request fresh report URLs when needed.

Candidate creation now returns the personal `/i/invite/{token}` URL. Candidate creation and updates accept `gender`, `birthday` (ISO date), `education`, `school`, `major`, `graduationYear` (integer), and `workExperience`. Nullable profile fields can be cleared with null; omitted fields remain unchanged on PATCH.

Question creation and updates also accept `description`, `starterCode` (language-to-source object), `validationRules`, `followUpPrompts`, `probeThreshold`, `showIf`, `skipIf`, `timeLimitSeconds` (positive integer), `allowFileUpload`, and `allowedFileTypes`.

## Bulk completion

Preview first by posting this body to `/interviews/{id}/sessions/end`:

```json
{"ids":["session-one","session-two"]}
```

`dryRun` defaults to true. Inspect the returned `data.results`; each item is `eligible`, `skipped`, `succeeded`, or `failed`, with a reason when applicable. Send the same IDs with `"dryRun":false` to execute. Batches accept 1–100 IDs and deduplicate them. Only in-progress sessions belonging to that interview are eligible; execution rechecks them. Processing continues after an individual failure. HTTP 200 does not imply every item succeeded. Completion uses the app's existing duration calculation and does not generate a report.

## Self-hosted upgrade

No new environment variables, dependencies, or migrations are required by these additions. Existing installations should already have applied the repository's migrations, including `003_audio_recordings.sql`. Kimi-only installations now select K2.6 for reports; OpenAI and Gemini keep their existing precedence. Kimi K2.6 non-streaming requests disable thinking and omit custom temperature.
