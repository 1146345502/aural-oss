# Upstream review — 2026-09-10

Reviewed local Aural history through `c88460b` against aural-oss `20913ec`.

| Upstream change | OSS decision |
| --- | --- |
| `8baf064` draft preservation and prompt resizing | Ported. |
| `20a5d38`, `a644674` recording preservation and recovery | Adapted for OSS storage and review; no cloud retention policy or deletion job. |
| `f30ed4a` Kimi K2.6 reports | Ported provider compatibility; retained OSS provider fallback order. |
| `c88460b` expanded API | Ported candidate/question fields, candidate updates, reports, practice reads, and previewed bulk completion with OpenAPI documentation. |
| `0dd2410` bulk actions | Ported completion failure propagation and API completion workflow. Cloud email actions and candidate-table bulk UI deferred. |
| `3106232`, `ce450a9` personal email invitations and CC | Deferred: OSS has no sendInvite/mail provider backend. Existing personal invite links remain available. |
| `cb09cc2` invitation reconciliation and generated schema | Deferred: contains production-specific schema/reconciliation work; requires a separate OSS migration design. |
| `b164500` idle duration on re-entry | Deferred: OSS has no matching enterSession/leaveSession lifecycle; the customer reconciliation script is not portable. |
| `289385c`, `adc94c7` billing accounting and alerts | Excluded from the self-hosted feature set. |
| `1adb526`, `a966c8b` July voice fixes | Already present in OSS `c910885`; not duplicated. |

No customer data, production repair scripts, cloud billing modules, or cloud email credentials were copied. Production services were not modified during development or testing.

## Validation

- `npm run test:web`: 350 tests passed, including real media-router execution with mocked Supabase/Storage, API write payloads, authorization/failure contracts, and OpenAPI reference validation.
- `npm run test:functional`: all 13 Chromium functional tests passed, including draft persistence across tabs and native prompt resizing.
- `npx tsc --noEmit`, `npm run lint`, and `npm run build`: passed.
- `git diff --check`: passed.

Browser tests cover draft preservation/resizing and the existing voice/editor/login flows; no real mail, paid LLM requests, or production database writes were used to validate the port. Live storage recovery against a deployed Supabase instance was not exercised.
