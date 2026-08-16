# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Simplified Chinese README with prominent language switching.
- Browser-backed fallback for job-description URL imports blocked by anti-bot challenges.
- Shared follow-up depth budget used by chat and both voice relays.
- Session resume helpers so invite links and owner reopen restore history and the correct question.
- Reopen action for in-progress walk-in sessions from the candidate table.
- Language toggle in the sidebar user menu.

### Changed

- Practice feedback actions can add or remove completed attempts from the answer bank.
- Interview completion screens now distinguish configured interview limits from account session limits.
- Practice grading compatibility estimate reduced from 20 to 10 AI tokens.
- Voice ASR defaults favor faster turn-taking (shorter end-window and coalesce delays).
- Locale geo-hint can only promote to Chinese, never overwrite a Chinese browser locale.

### Fixed

- Keep the animated AI border complete on cards with wide aspect ratios.
- Follow-up limits now match the LIGHT / MODERATE / DEEP labels in interview settings.
- Voice interviews keep long spoken turns intact, wait for real TTS playback end, and clear cancelled ASR UI.
- Invite-link sessions resume instead of restarting from the first question.

## [0.3.1] - 2026-06-19

### Fixed

- Add missing `/api/auth/send-verification` route for password change and account deletion OTP flows.
- Align account OTP inputs with Supabase reauthentication (6-digit code instead of 8).
- Add `/api/locale` endpoint used by the locale provider.
- Redirect `/signup` to `/register`.

## [0.3.0] - 2026-06-19

### Added

- Practice session overhaul: guided tour, question navigator, answer targets, voice delivery timeline, and rich-text editor.
- Personal answer bank to bookmark strong practice answers.
- Practice session report page with per-question graded attempts.
- Account deletion hardening with OTP reauthentication and FK cleanup migration.

### Changed

- Prep suggested-answer panel with layered hints and refinement flow.
- Candidate page i18n improvements and interview preview session targeting.

### Fixed

- Mic capture starts before relay ASR is ready.
- Practice session duration stops when the user leaves.
- Account deletion cleans up organization and project ownership safely.

## [0.2.0] - 2026-05-24

### Added

- Interview practice mode with voice coaching and relay improvements.
- JD/Resume upload to customize AI interview generation.
- Private chat session UI: floating composer, progress header, and resizable whiteboard/code side panels.
- Chunk-load recovery hook for Monaco and Excalidraw lazy bundles.

### Changed

- Chat-only onboarding skips the interviewee product tour.
- Question navigation uses internal system messages and manual-navigation handling in the chat API.

### Fixed

- Chat-only mode question UI stays in sync with the conversation.

## [0.1.0] - 2026-03-16

### Added

- Initial open-source release of the Aural AI interview platform.
- Voice, chat, and video interview modes.
- Live coding (Monaco) and whiteboard (Excalidraw) support.
- Automated AI scoring reports and anti-cheating safeguards.
- Team management, multilingual UI, and pluggable LLM providers.
- Self-hosted deployment with Docker, Supabase, and Node.js.

[0.3.0]: https://github.com/1146345502/aural-oss/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/1146345502/aural-oss/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/1146345502/aural-oss/releases/tag/v0.1.0
