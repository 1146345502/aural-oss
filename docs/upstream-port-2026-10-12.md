# Upstream port — 2026-10-12

Compared the private repository after `c88460b` with OSS `ff366fb`. This port applies selected changes from `6bc74ae` and the recovery-test correction in `235a506`, plus the standalone feedback-save check from `57fa380`.

| Change | OSS adaptation |
| --- | --- |
| Voice transcript revisions and recovery | Preserve recognized speech across reconnects, replay buffered audio, and accept authoritative corrections and empty retractions. Keep OSS TTS authentication and recording/session behavior. |
| Voice feedback UI | Keep captions stable through pauses and finalization, distinguish transcription from reply generation, and respect reduced-motion preferences. Retain the existing OSS browser scenarios. |
| Optional Qwen ASR | Add both Qwen protocol adapters with server-side credentials. Seed remains the default; TTS, relay LLM defaults, and the separate Azure relay are unchanged. |
| Isolated local launcher | Add `dev:local`, require loopback app/backend/relay URLs, mask inherited provider credentials and other env-file settings, and ignore `.env.testing.local` in Git. |
| Practice feedback save failure | Check the Supabase insert error and returned attempt ID before confirming persistence. Exercise the actual feedback route with fixture auth/storage responses and no LLM requests. |

No plugin/OAuth endpoints, cloud billing, invitation-email backend, production deployment scripts, or database migrations are included. The OSS dependency versions and lockfile are retained. English and Chinese READMEs document setup, provider selection, credential requirements, and switching back to Seed.

## Validation

- `npm run test:web`: 391 tests passed, with no skips. Includes protocol/transport fixtures, full relay recovery with simulated provider failures, feedback persistence through the real route, and local environment isolation.
- `npm run test:functional`: all 17 Chromium tests passed, including Qwen retractions, stable captions, and normal/reduced-motion transcription feedback.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`: passed.
- Browser tests and the build used explicit placeholder backend/provider settings. No live provider, microphone, production database, or deployment validation was performed.
