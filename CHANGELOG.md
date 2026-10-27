# Changelog

All notable changes to `@dakera-ai/ai-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-10-27

Dakera server **v0.12.3** support. Requires `@dakera-ai/dakera` `^0.12.3` (peer and dev dependency).

### Fixed

- The middleware injects at most `recallK` memories and the `recallMemory` tool returns at most `topK`.
  A server appends session-neighbourhood context after the ranked results by default (with a `score` that is
  not comparable to theirs); recall now asks for `neighborhood_mode: "separate"` and leaves out any item marked
  `retrieval: "neighborhood"` (servers before v0.12.3 ignore the mode).

### Added

- `storeMemory` tool: optional `eventTime` (an ISO 8601 date-time with an offset), sent as `event_time` — when
  the fact happened. Server v0.12.3 keeps it as `_dakera_event_time` and reads it for recency and `since` /
  `until`; older servers ignore it.
- `tests/integration.test.ts`: middleware (generate and stream), tools, event time and the `topK` bound
  against a live server, skipped unless `DAKERA_API_URL` is set; CI runs it against
  `ghcr.io/dakera-ai/dakera:0.12.3` (readiness polled from the runner: the 0.12.3 image has no `curl`).

### Changed

- The recall `score` is the server's ranking score (`rank_score`) on a v0.12.3 server, through
  `@dakera-ai/dakera` 0.12.3.
- A store that fails with a `5xx` or times out is no longer retried by `@dakera-ai/dakera` 0.12.3, so an
  exchange is not stored twice; the middleware still ignores storage errors.
- Dev dependencies: `npm audit fix` (vitest 4.1.12, zod 4.6.7, ...); `npm audit` reports 0 vulnerabilities.

## [0.2.0] - 2026-10-01

### Changed

- Requires `@dakera-ai/dakera` `^0.12.1` (peer and dev dependency). Compatible with Dakera server v0.12.0 and v0.11.108.
- No source changes were needed: the middleware and tools do not use the removed SDK members
  (`fetch`, `flush`, `configureTtl`, `listExtractProviders`) or `memoryLink`.

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
