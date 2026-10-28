# @dakera-ai/ai-sdk

**Persistent, decay-weighted memory for the Vercel AI SDK — a language-model middleware and two tools, backed
by a self-hosted [Dakera](https://dakera.ai) server.**

[![CI](https://github.com/Dakera-AI/dakera-ai-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Dakera-AI/dakera-ai-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dakera-ai/ai-sdk)](https://www.npmjs.com/package/@dakera-ai/ai-sdk)
[![Downloads](https://img.shields.io/npm/dm/@dakera-ai/ai-sdk)](https://www.npmjs.com/package/@dakera-ai/ai-sdk)
[![Node](https://img.shields.io/node/v/@dakera-ai/ai-sdk)](https://www.npmjs.com/package/@dakera-ai/ai-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/LICENSE)
[![Dakera server](https://img.shields.io/badge/Dakera%20server-v0.12.3-22c55e)](https://dakera.ai)
[![LoCoMo](https://img.shields.io/badge/LoCoMo-88.2%25-brightgreen)](https://dakera.ai/benchmark)

Wrap any AI SDK model and it remembers your users across sessions: before each call the memories relevant to
the last message are put into the prompt, and after it the exchange is stored on the Dakera server. Memories
are importance-scored and decay over time, Dakera embeds on the server (no embeddings API key), and the whole
memory layer is one self-hosted container.

## Why Dakera

- **Two lines, no rewrite.** `wrapLanguageModel({ model, middleware })` — your `generateText` / `streamText`
  calls and your provider stay exactly as they are.
- **Built for stateless runtimes.** Memory lives on the server, so a serverless function, an edge route or a
  redeploy starts every request with what the user said last week.
- **Recall, not replay.** Only the few memories relevant to the current message are injected; importance and
  time decay keep stale facts from crowding out fresh ones.
- **Model-driven memory when you want it.** `recallMemory` / `storeMemory` tools let the model decide what to
  look up and what is worth keeping.
- **Never breaks a generation.** Memory is best-effort: if Dakera is unreachable the model is called without
  memories.
- **Measured recall.** 88.2% Recall@20 on the [LoCoMo](https://dakera.ai/benchmark) long-conversation memory
  benchmark.

## Contents

- [Quick start](#quick-start)
- [Compatibility](#compatibility)
- [What's new in 0.3.0](#whats-new-in-030)
- [Memory middleware](#memory-middleware)
- [Memory tools](#memory-tools)
- [Middleware and tools together](#middleware-and-tools-together)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Related packages](#related-packages)
- [Links](#links)
- [License](#license)

## Quick start

### 1. Run Dakera

```bash
docker run -d --name dakera -p 3000:3000 -v dakera-data:/data \
  -e DAKERA_ROOT_API_KEY=dk-mykey \
  ghcr.io/dakera-ai/dakera:0.12.3

curl http://localhost:3000/health   # {"service":"dakera","status":"healthy","version":"0.12.3",...}
```

The image ships its default embedding model, so the server is ready in seconds; memories persist in the
`dakera-data` volume. Docker Compose, Kubernetes and Helm setups:
[dakera-deploy](https://github.com/Dakera-AI/dakera-deploy).

### 2. Install

```bash
npm install @dakera-ai/ai-sdk @dakera-ai/dakera ai zod
npm install @ai-sdk/openai   # or the provider you use
```

`@dakera-ai/dakera` (the Dakera client), `ai` and `zod` are peer dependencies.

### 3. Remember across sessions

```bash
export DAKERA_URL=http://localhost:3000   # the default
export DAKERA_API_KEY=dk-mykey
```

```typescript
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: createDakeraMemoryMiddleware({ agentId: "user-1234" }), // one agent per user
});

// Session 1
await generateText({ model, prompt: "I'm building a Rust vector database called Velox." });

// Session 2 — days later, another process
const { text } = await generateText({ model, prompt: "What am I working on?" });
console.log(text); // e.g. "You're building Velox, a Rust vector database."
```

## Compatibility

| `@dakera-ai/ai-sdk` | Dakera server | `@dakera-ai/dakera` | `ai` (AI SDK) | Node.js |
|---|---|---|---|---|
| **0.3.x** | v0.12.0 – **v0.12.3** | `^0.12.3` | 6 and 7 | `>=20` |
| 0.2.x | v0.12.0 | `^0.12.1` | `>=6` | `>=20` |

`zod` 3.23+ or 4. The `storeMemory` tool's `eventTime` is kept only by a v0.12.3 server (older servers ignore
it); everything else works on any v0.12 server.

## What's new in 0.3.0

- **Dakera server v0.12.3** with `@dakera-ai/dakera` `^0.12.3`.
- The middleware injects at most `recallK` memories and `recallMemory` returns at most `topK` — never the
  server's extra session-neighbourhood context.
- A failed recall (server down, wrong URL, `401`) no longer fails the generation; new `onError` hook to see it.
- The first call for a new agent no longer fails on servers before v0.12.3.
- `storeMemory` takes an optional `eventTime` — when the fact happened.
- Typed against the installed AI SDK: works with AI SDK 6 and 7.

Full list: [CHANGELOG](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/CHANGELOG.md).

## Memory middleware

`createDakeraMemoryMiddleware` wraps any language model. On every call it:

1. recalls up to `recallK` memories relevant to the last user message,
2. prepends them to the prompt as a system message,
3. after the call — or once a stream has finished — stores the user message and the answer as two memories
   (`User: …` and `Assistant: …`).

It works the same with `streamText`; the exchange is stored when the stream finishes:

```typescript
import { streamText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: createDakeraMemoryMiddleware({
    agentId: "user-1234",
    recallK: 5,       // inject up to 5 relevant memories per call
    importance: 0.8,  // importance of the stored exchange (0 – 1)
    onError: (error, operation) => console.warn(`Dakera ${operation} failed`, error), // "recall" | "store"
  }),
});

const { textStream } = streamText({ model, prompt: "Summarise what I've told you about my project." });
for await (const chunk of textStream) {
  process.stdout.write(chunk);
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `agentId` | `string` | — | Scopes stored and recalled memories, e.g. one per user **(required)** |
| `apiUrl` | `string` | `$DAKERA_URL` / `http://localhost:3000` | Dakera server URL |
| `apiKey` | `string` | `$DAKERA_API_KEY` | Dakera API key; omit for a server running without auth |
| `client` | `DakeraClient` | — | Pre-built client (overrides `apiUrl` / `apiKey`) |
| `recallK` | `number` | `5` | Maximum memories injected per call |
| `minImportance` | `number` | `0` | Recall only memories at least this important (0 – 1) |
| `importance` | `number` | `0.7` | Importance assigned to stored memories (0 – 1) |
| `store` | `boolean` | `true` | Store the exchange after each call |
| `header` | `string` | `"Relevant memories from previous sessions (use them if helpful):"` | First line of the injected system message |
| `onError` | `(error, operation) => void` | — | Called with the recall / store errors the middleware absorbs |

Memory is best-effort: when the recall fails the model is called without memories, and when storing fails the
result is returned as is. A v0.12.3 server can add the session's neighbouring memories to a recall as extra
context; the middleware asks for it separately and leaves it out, so `recallK` is a hard limit.

## Memory tools

`createDakeraTools` returns `recallMemory` and `storeMemory` tools. The model decides when to look something
up or persist a new fact — useful for agentic workflows where explicit memory control improves quality.

```typescript
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraTools } from "@dakera-ai/ai-sdk";

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools: createDakeraTools({ agentId: "user-1234" }),
  stopWhen: stepCountIs(4), // let the model call tools, then answer
  prompt: "Remember that I prefer metric units. Then convert 5 miles to km.",
});
console.log(text);
// The model calls storeMemory({ content: "User prefers metric units", importance: 0.8 }),
// then answers: "5 miles ≈ 8.05 km."
```

| Tool | Input | Output |
|---|---|---|
| `recallMemory` | `query`, optional `topK` (default `recallK`) | at most `topK` memories, best first: `{ content, importance, score }[]` |
| `storeMemory` | `content`, optional `importance` (0 – 1) and `eventTime` | `{ id, status: "stored" }` |

`eventTime` is when the fact happened, as an ISO 8601 date-time with an offset (`2026-05-20T14:00:00Z`); a
v0.12.3 server uses it for recency and time-range recall, while the memory's creation time stays the time it
was stored. A Dakera error inside a tool is reported to the model as a tool error. Without `stopWhen`, the
generation ends after the first tool call.

| Option | Type | Default | Description |
|---|---|---|---|
| `agentId` | `string` | — | Scopes stored and recalled memories **(required)** |
| `apiUrl` | `string` | `$DAKERA_URL` / `http://localhost:3000` | Dakera server URL |
| `apiKey` | `string` | `$DAKERA_API_KEY` | Dakera API key |
| `client` | `DakeraClient` | — | Pre-built client (overrides `apiUrl` / `apiKey`) |
| `recallK` | `number` | `5` | Default `topK` of `recallMemory` |
| `importance` | `number` | `0.7` | Default importance of `storeMemory` |

## Middleware and tools together

Recall automatically with the middleware and let the model decide what is worth remembering — one shared
client for both:

```typescript
import { generateText, stepCountIs, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware, createDakeraTools } from "@dakera-ai/ai-sdk";
import { DakeraClient } from "@dakera-ai/dakera";

const client = new DakeraClient({
  baseUrl: process.env.DAKERA_URL ?? "http://localhost:3000",
  apiKey: process.env.DAKERA_API_KEY,
  timeout: 10_000,
});
const agentId = "user-1234";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: createDakeraMemoryMiddleware({ client, agentId, store: false }), // recall only
});

const { text } = await generateText({
  model,
  tools: createDakeraTools({ client, agentId }), // the model stores what matters
  stopWhen: stepCountIs(6),
  system: "You are a helpful assistant. Use storeMemory for facts the user will want remembered across sessions.",
  prompt: "My deadline for the Velox project is Friday the 11th.",
});
console.log(text);
```

A shared `DakeraClient` also lets several agents reuse one connection, timeout and retry configuration.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DAKERA_URL` | `http://localhost:3000` | Server URL, used when neither `apiUrl` nor `client` is given |
| `DAKERA_API_KEY` | — | API key, used when neither `apiKey` nor `client` is given: the server's `DAKERA_ROOT_API_KEY` or a scoped key created with the admin API. Omit it for a server running with `DAKERA_AUTH_ENABLED=false` |

Options always win over the environment. Use the middleware and tools on the server side (route handlers,
server actions, server components, API routes) and keep `DAKERA_API_KEY` out of client bundles.

The client retries `429` and `503` answers for every call, and other server errors, timeouts and network
errors for reads only: a store that failed with a `500` or timed out is not sent again, so an exchange is never
stored twice.

## Examples

Runnable scripts in [`examples/`](https://github.com/Dakera-AI/dakera-ai-sdk/tree/main/examples). They call
OpenAI — swap `openai("gpt-4o-mini")` for any AI SDK provider's model.

```bash
git clone https://github.com/Dakera-AI/dakera-ai-sdk && cd dakera-ai-sdk
npm install && npm run build
cd examples && npm install
OPENAI_API_KEY=sk-... DAKERA_API_KEY=dk-mykey npx tsx 01-middleware.ts
```

| File | What it shows | LLM key? |
|---|---|---|
| [`01-middleware.ts`](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/examples/01-middleware.ts) | Transparent recall and store across two "sessions" | Yes (OpenAI) |
| [`02-tools.ts`](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/examples/02-tools.ts) | Model-driven memory with `recallMemory` / `storeMemory` and `stopWhen` | Yes (OpenAI) |
| [`03-combined.ts`](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/examples/03-combined.ts) | Middleware recall + tool-driven storing with one shared client | Yes (OpenAI) |
| [`04-streaming.ts`](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/examples/04-streaming.ts) | `streamText`: stored when the stream ends, recalled on the next call; `onError` | Yes (OpenAI) |

## Troubleshooting

**The model never sees memories** — pass `onError` to the middleware: a failing recall (wrong `DAKERA_URL`,
`401`, server down) is absorbed so generation keeps working. Check the server with
`curl http://localhost:3000/health`; the quick start publishes port **3000** (this repository's CI uses 3300).

**`401` from the server** — `DAKERA_API_KEY` (or `apiKey`) must be a key the server accepts, e.g. its
`DAKERA_ROOT_API_KEY`.

**No memories on the first call** — expected: the agent has stored nothing yet. Servers before v0.12.3 answer
such a recall with `404 NAMESPACE_NOT_FOUND`; the middleware and `recallMemory` treat that as "no memories".

**Fewer memories than expected** — `recallK` / `topK` are hard limits and `minImportance` filters out less
important memories; the server's session-neighbourhood context is deliberately left out.

**The model calls a tool and then stops without answering** — set `stopWhen: stepCountIs(n)`; AI SDK 5+ no
longer reads `maxSteps`.

**`Cannot find name 'process'`** — add `"types": ["node"]` to your `tsconfig.json` `compilerOptions`.

## Development

```bash
npm install
npm run build && npm run lint && npm run typecheck && npm test
DAKERA_API_URL=http://localhost:3000 DAKERA_API_KEY=dk-mykey npm test   # + live tests against a server
```

See [CONTRIBUTING](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/CONTRIBUTING.md).

## Related packages

| Package | What it is |
|---|---|
| [`dakera`](https://pypi.org/project/dakera/) · [`@dakera-ai/dakera`](https://www.npmjs.com/package/@dakera-ai/dakera) · [`dakera-client`](https://crates.io/crates/dakera-client) · [`dakera-go`](https://github.com/Dakera-AI/dakera-go) | Python, TypeScript, Rust and Go SDKs |
| [`langchain-dakera`](https://pypi.org/project/langchain-dakera/) | LangChain (Python): memory, vector store, sessions, knowledge graph |
| [`@dakera-ai/langchain`](https://www.npmjs.com/package/@dakera-ai/langchain) | LangChain.js: memory, vector store, sessions, knowledge graph |
| [`llamaindex-dakera`](https://pypi.org/project/llamaindex-dakera/) | LlamaIndex: memory block, vector store, memory store |
| [`autogen-dakera`](https://pypi.org/project/autogen-dakera/) | AutoGen: `Memory` for `AssistantAgent`, sessions, knowledge graph |
| [`crewai-dakera`](https://pypi.org/project/crewai-dakera/) | CrewAI: storage for a crew's memories |
| [`strands-dakera`](https://pypi.org/project/strands-dakera/) | Strands Agents: memory tool and `MemoryStore` |
| **[`@dakera-ai/ai-sdk`](https://www.npmjs.com/package/@dakera-ai/ai-sdk)** | **Vercel AI SDK: memory middleware and tools** |

## Links

- [dakera.ai](https://dakera.ai) · [Documentation](https://dakera.ai/docs) ·
  [Vercel AI SDK guide](https://dakera.ai/integrations/vercel-ai-sdk.html) ·
  [Benchmark](https://dakera.ai/benchmark)
- Deploy: [dakera-deploy](https://github.com/Dakera-AI/dakera-deploy) (Docker Compose, Kubernetes) ·
  [dakera-helm](https://github.com/Dakera-AI/dakera-helm) · server image `ghcr.io/dakera-ai/dakera`
- Tools: [dakera-mcp](https://github.com/Dakera-AI/dakera-mcp) (MCP server) ·
  [dakera-cli](https://github.com/Dakera-AI/dakera-cli) (`dk` CLI)
- [Issues](https://github.com/Dakera-AI/dakera-ai-sdk/issues) ·
  [Changelog](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/CHANGELOG.md) ·
  [Security policy](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/.github/SECURITY.md)

## License

[MIT](https://github.com/Dakera-AI/dakera-ai-sdk/blob/main/LICENSE) © [Dakera AI](https://dakera.ai)
