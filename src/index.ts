/**
 * @dakera-ai/ai-sdk — Vercel AI SDK integration for the Dakera AI memory platform.
 *
 * Two complementary patterns for persistent, decay-weighted cross-session memory:
 *
 * - {@link createDakeraMemoryMiddleware} — transparent recall + store via
 *   `wrapLanguageModel({ model, middleware })`.
 * - {@link createDakeraTools} — model-driven `recallMemory` / `storeMemory` tools.
 *
 * @packageDocumentation
 */
export { createDakeraMemoryMiddleware } from "./middleware.js";
export type { DakeraMemoryMiddlewareOptions } from "./middleware.js";

export { createDakeraTools } from "./tools.js";
export type { DakeraToolsOptions } from "./tools.js";

export { resolveClient, DEFAULT_DAKERA_URL } from "./client.js";
export type { DakeraConnectionOptions } from "./client.js";
