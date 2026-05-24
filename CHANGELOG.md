# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/1146345502/aural-oss/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/1146345502/aural-oss/releases/tag/v0.1.0
