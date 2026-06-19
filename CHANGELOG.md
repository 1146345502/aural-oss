# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
