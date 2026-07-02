# Changelog

All notable changes to `@dakera-ai/ai-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-02

### Added

- `createDakeraMemoryMiddleware` — Vercel AI SDK language model middleware that
  recalls relevant memories into system context (`transformParams`) and persists
  each exchange back to Dakera (`wrapGenerate`), with graceful degradation on
  storage errors.
- `createDakeraTools` — model-driven `recallMemory` / `storeMemory` tools with
  zod input schemas.
- `resolveClient` helper with `DAKERA_URL` / `DAKERA_API_KEY` environment fallback.
- CJS + ESM + type-declaration builds; unit tests for both patterns.
