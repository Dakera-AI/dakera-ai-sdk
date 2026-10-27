# @dakera-ai/ai-sdk

[![npm version](https://img.shields.io/npm/v/@dakera-ai/ai-sdk.svg)](https://www.npmjs.com/package/@dakera-ai/ai-sdk)
[![CI](https://github.com/dakera-ai/dakera-ai-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/dakera-ai/dakera-ai-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Docs](https://img.shields.io/badge/docs-dakera.ai-3b82f6)](https://dakera.ai/docs)

Vercel AI SDK integration for [Dakera](https://dakera.ai) — a self-hosted memory server that gives your
models **persistent, decay-weighted memory** across sessions.

Memories are importance-scored and decay over time, so stale context stops competing with fresh, relevant
facts. The integration plugs into the AI SDK's two standard extension points — **language model
middleware** and **tools** — so you add cross-session memory to any AI SDK app without changing your model
or provider code. Dakera embeds on the server: no embeddings API key needed.

## Compatibility

| | Version |
|---|---|
| Dakera server | **v0.12.3** (v0.12.0 – v0.12.2 work too; `eventTime` is kept only from v0.12.3) |
| `@dakera-ai/dakera` | `^0.12.3` |
| `ai` (AI SDK) | 6 and 7 |
| `zod` | 3.23+ or 4 |
| Node.js | 20+ |

## Quick start

Run a Dakera server (self-hosted, no external dependencies):

```bash
docker run -d \
  --name dakera \
  -p 3000:3000 \
  -e DAKERA_ROOT_API_KEY=dk-mykey \
  ghcr.io/dakera-ai/dakera:0.12.3

curl http://localhost:3000/health  # → {"service":"dakera","status":"healthy","version":"0.12.3",...}
```

Persistent storage, Docker Compose, Kubernetes and Helm: see the deployment guide,
[dakera-deploy](https://github.com/dakera-ai/dakera-deploy).

Install the integration with its peer dependencies, plus the provider you use:

```bash
npm install @dakera-ai/ai-sdk @dakera-ai/dakera ai zod
npm install @ai-sdk/openai
```

Point it at the server — through environment variables, or the `apiUrl` / `apiKey` / `client` options:

```bash
export DAKERA_URL=http://localhost:3000   # the default
export DAKERA_API_KEY=dk-mykey             # omit for a server running without auth
```

## Pattern 1 — Memory middleware (transparent)

`createDakeraMemoryMiddleware` wraps any language model. On every call it:

1. Recalls up to `recallK` memories relevant to the last user message
2. Prepends them to the prompt as a system message
3. After the call — or once a stream has finished — stores the user message and the answer as two memories
   (`User: …` and `Assistant: …`)

Your generation code stays unchanged.

```typescript
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: createDakeraMemoryMiddleware({
    agentId: "user-1234", // scopes memories to this agent / user
    recallK: 5,           // inject up to 5 relevant memories per call
  }),
});

// Session 1
await generateText({
  model,
  prompt: "I'm building a Rust vector database called Velox.",
});

// Session 2 — days later, different process
const { text } = await generateText({
  model,
  prompt: "What am I working on?",
});
console.log(text); // → "You're building Velox, a Rust vector database."
```

### Streaming

The middleware works with `streamText` unchanged; the exchange is stored when the stream finishes:

```typescript
import { streamText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: createDakeraMemoryMiddleware({ agentId: "user-1234" }),
});

const { textStream } = streamText({
  model,
  prompt: "Summarise what I've told you about my project.",
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}
```

### Memory never breaks a generation

Memory is best-effort. When the recall fails (the server is down, a timeout, ...) the model is called without
memories; when storing fails the result is returned as is. Pass `onError` to see those errors:

```typescript
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const middleware = createDakeraMemoryMiddleware({
  agentId: "user-1234",
  onError: (error, operation) => console.warn(`Dakera ${operation} failed`, error), // "recall" | "store"
});
```

### Middleware options

| Option | Type | Default | Description |
|---|---|---|---|
| `agentId` | `string` | — | Scopes stored and recalled memories **(required)** |
| `apiUrl` | `string` | `$DAKERA_URL` / `http://localhost:3000` | Dakera server URL |
| `apiKey` | `string` | `$DAKERA_API_KEY` | Dakera API key |
| `client` | `DakeraClient` | — | Pre-built client (overrides `apiUrl` / `apiKey`) |
| `recallK` | `number` | `5` | Maximum memories injected per call |
| `minImportance` | `number` | `0` | Recall only memories at least this important (0 – 1) |
| `importance` | `number` | `0.7` | Importance assigned to stored memories (0 – 1) |
| `store` | `boolean` | `true` | Store the exchange after each call |
| `header` | `string` | `"Relevant memories from previous sessions (use them if helpful):"` | First line of the injected system message |
| `onError` | `(error, operation) => void` | — | Called with recall / store errors the middleware absorbed |

A server v0.12.3 can add the session's neighbouring memories as extra context to a recall; the middleware
asks for that context separately and leaves it out, so `recallK` is a hard limit.

## Pattern 2 — Memory tools (model-driven)

`createDakeraTools` returns `recallMemory` and `storeMemory` tools. The model decides when to look something
up or persist a new fact — useful for agentic workflows where explicit memory control improves quality.

```typescript
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraTools } from "@dakera-ai/ai-sdk";

const tools = createDakeraTools({ agentId: "user-1234" });

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools,
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

`eventTime` is when the fact happened, as an ISO 8601 date-time with an offset (`2026-05-20T14:00:00Z`). The
server (v0.12.3+) uses it for recency and time-range recall; the memory's creation time stays the time it
was stored. A Dakera error inside a tool is reported to the model as a tool error.

### Tool options

| Option | Type | Default | Description |
|---|---|---|---|
| `agentId` | `string` | — | Scopes stored and recalled memories **(required)** |
| `apiUrl` | `string` | `$DAKERA_URL` / `http://localhost:3000` | Dakera server URL |
| `apiKey` | `string` | `$DAKERA_API_KEY` | Dakera API key |
| `client` | `DakeraClient` | — | Pre-built client (overrides `apiUrl` / `apiKey`) |
| `recallK` | `number` | `5` | Default `topK` of `recallMemory` |
| `importance` | `number` | `0.7` | Default importance of `storeMemory` |

## Pattern 3 — Combined (transparent + explicit)

Use the middleware for automatic recall and the tools when you want the model to decide what is worth
remembering:

```typescript
import { generateText, stepCountIs, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware, createDakeraTools } from "@dakera-ai/ai-sdk";
import { DakeraClient } from "@dakera-ai/dakera";

// Share one client between middleware and tools
const client = new DakeraClient({
  baseUrl: process.env.DAKERA_URL ?? "http://localhost:3000",
  apiKey: process.env.DAKERA_API_KEY,
});
const agentId = "user-1234";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  // Recall automatically, but let the tools handle persistence
  middleware: createDakeraMemoryMiddleware({ client, agentId, store: false }),
});

const { text } = await generateText({
  model,
  tools: createDakeraTools({ client, agentId }),
  stopWhen: stepCountIs(6),
  system:
    "You are a helpful assistant. Use storeMemory for facts the user will want remembered across sessions.",
  prompt: "My deadline for the Velox project is Friday the 11th.",
});
console.log(text);
```

## Using a pre-built client

Share connection settings across agents, or configure timeouts and retries once:

```typescript
import { DakeraClient } from "@dakera-ai/dakera";
import { createDakeraMemoryMiddleware, createDakeraTools } from "@dakera-ai/ai-sdk";

const client = new DakeraClient({
  baseUrl: "http://my-dakera.internal:3000",
  apiKey: process.env.DAKERA_API_KEY,
  timeout: 10_000,
});

// All agents share the same connection
const supportMiddleware = createDakeraMemoryMiddleware({ client, agentId: "support-bot" });
const salesTools = createDakeraTools({ client, agentId: "sales-bot" });
```

The client retries `429` and `503` answers for every call, and other server errors, timeouts and network
errors for reads only: a store that failed with a `500` or timed out is not sent again, so an exchange is
never stored twice.

## Running the examples

```bash
git clone https://github.com/dakera-ai/dakera-ai-sdk
cd dakera-ai-sdk
npm install && npm run build
cd examples && npm install
OPENAI_API_KEY=sk-... DAKERA_URL=http://localhost:3000 DAKERA_API_KEY=dk-mykey npx tsx 01-middleware.ts
```

See [`examples/README.md`](examples/README.md) for all examples.

## Testing

`npm test` runs the unit tests. `tests/integration.test.ts` runs the middleware (generate and stream) and
the tools against a live server when `DAKERA_API_URL` is set:

```bash
docker run -d -p 3300:3300 -e DAKERA_PORT=3300 -e DAKERA_AUTH_ENABLED=false ghcr.io/dakera-ai/dakera:0.12.3
DAKERA_API_URL=http://localhost:3300 npm test
```

## Troubleshooting

**`Cannot find name 'process'`** — add `"types": ["node"]` to your `tsconfig.json` `compilerOptions`.

**Memory recall is empty on the first call** — expected: the agent has no memories yet. After the first
exchange has been stored, later calls recall it.

**The model never sees memories** — pass `onError` to the middleware: a failing recall (wrong URL, `401`,
server down) is absorbed so generation keeps working.

**Getting `401` from the server** — `DAKERA_API_KEY` (or `apiKey`) must be a key the server accepts, e.g. its
`DAKERA_ROOT_API_KEY` or a key created with the Dakera admin API.

**Using with Next.js / edge runtime** — set `DAKERA_URL` and `DAKERA_API_KEY` as server-side environment
variables and use the middleware or tools in route handlers or server components; keep the API key out of
client bundles.

## Related packages

| Package | Framework | Language |
|---|---|---|
| [`@dakera-ai/dakera`](https://github.com/Dakera-AI/dakera-js) | — (Dakera client) | TypeScript |
| [`@dakera-ai/langchain`](https://github.com/Dakera-AI/dakera-langchain-js) | LangChain.js | TypeScript |
| [`langchain-dakera`](https://pypi.org/project/langchain-dakera/) | LangChain | Python |
| [`llamaindex-dakera`](https://pypi.org/project/llamaindex-dakera/) | LlamaIndex | Python |
| [`crewai-dakera`](https://pypi.org/project/crewai-dakera/) | CrewAI | Python |
| [`autogen-dakera`](https://pypi.org/project/autogen-dakera/) | AutoGen | Python |
| [`strands-dakera`](https://pypi.org/project/strands-dakera/) | Strands Agents | Python |

## Links

- [Dakera documentation](https://dakera.ai/docs)
- [Vercel AI SDK integration guide](https://dakera.ai/integrations/vercel-ai-sdk.html)
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

## License

MIT © [Dakera](https://dakera.ai)
