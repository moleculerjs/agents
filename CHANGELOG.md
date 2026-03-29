# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-03-29

### Changed
- Updated `moleculer` peer dependency from `^0.15.0-beta` to `^0.15.0` (stable release).
- Translated PRD files to English for public repository.

### Fixed
- Fixed publish workflow for npm trusted publishing (OIDC).

## [1.0.0] - 2026-03-22

Initial release with core AI agent capabilities for Moleculer.

### Added
- **AgentMixin** — ReAct loop with tool calling, streaming, max iterations, and conversation history.
- **LLMService** — Pluggable LLM adapter layer with OpenAI, Anthropic, and Fake (testing) adapters.
- **MemoryMixin** — Conversation history persistence with sliding window compaction.
- **OrchestratorMixin** — Multi-agent coordination for complex workflows (Phase 2).
- Schema converter for Moleculer action params ↔ LLM tool schemas.
- Dual CJS/ESM build with TypeScript.
- GitHub Actions CI (test, typecheck, publish via OIDC trusted publishers).
- Examples: simple-agent, multi-turn-chat with auto-detected LLM provider.
