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
- A failing recall no longer fails the generation: the middleware's `transformParams` threw, so a Dakera
  outage, a wrong URL or a `401` failed every `generateText` / `streamText` call. The model is now called
  without memories (storage errors were already absorbed). In particular, the first call for a new agent
  failed on servers before v0.12.3, which answer a recall for an agent that has stored nothing with
  `404 NAMESPACE_NOT_FOUND`; the middleware and the `recallMemory` tool treat that answer as no memories.
- Examples: they passed `maxSteps`, which AI SDK 5+ no longer reads, so a tool call ended the generation
  without an answer; they use `stopWhen: stepCountIs(n)`. Their dependencies installed `latest` of this
  package and `@ai-sdk/openai` 1 (incompatible with AI SDK 7); they now install the package from the
  repository (`file:..`), `@ai-sdk/openai` 4, `@dakera-ai/dakera` `^0.12.3` and zod 4. The `createDakeraTools`
  TSDoc example also sets `stopWhen`.

### Added

- `storeMemory` tool: optional `eventTime` (an ISO 8601 date-time with an offset), sent as `event_time` — when
  the fact happened. Server v0.12.3 keeps it as `_dakera_event_time` and reads it for recency and `since` /
  `until`; older servers ignore it.
- Middleware option `onError(error, operation)`: called with the recall or store errors the middleware
  absorbs (`operation` is `"recall"` or `"store"`), for logging or metrics; an error thrown by it is ignored.
- `tests/integration.test.ts`: middleware (generate and stream), tools, event time and the `topK` bound
  against a live server, skipped unless `DAKERA_API_URL` is set; CI runs it against
  `ghcr.io/dakera-ai/dakera:0.12.3` (readiness polled from the runner: the 0.12.3 image has no `curl`).

### Changed

- The recall `score` is the server's ranking score (`rank_score`) on a v0.12.3 server, through
  `@dakera-ai/dakera` 0.12.3.
- A store that fails with a `5xx` or times out is no longer retried by `@dakera-ai/dakera` 0.12.3, so an
  exchange is not stored twice; the middleware still ignores storage errors.
- `createDakeraMemoryMiddleware()` is typed with the installed AI SDK's `LanguageModelMiddleware` (from
  `ai`) instead of `@ai-sdk/provider`'s `LanguageModelV3Middleware`, so the declarations match AI SDK 6 and 7;
  `@ai-sdk/provider` is no longer a dev dependency.
- Lint: an ESLint flat config (`eslint.config.mjs`, `typescript-eslint`), as in `@dakera-ai/dakera`;
  `npm run lint` checks `src`, `tests` and `examples` (it had no config and failed). `npm run typecheck` also
  checks the tests (`tests/tsconfig.json`).
- CI: lint step; the unit tests run with AI SDK 6 and the latest AI SDK on Node 20 and 22; an examples job
  type-checks the examples against the build (`npm run typecheck:examples`; they call OpenAI, so CI does not
  run them).
- README, `examples/README.md` and CONTRIBUTING rewritten against the current API: compatibility table,
  server quick start for v0.12.3, `DAKERA_URL` / `DAKERA_API_KEY`, option tables (`minImportance`,
  `onError`), tool inputs and outputs, `eventTime`, the client's retry behaviour, live tests, troubleshooting.
  Every README snippet and example was type-checked and run against a v0.12.3 server with a mock model.
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
