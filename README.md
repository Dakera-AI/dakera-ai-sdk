# @dakera-ai/ai-sdk

[![npm version](https://img.shields.io/npm/v/@dakera-ai/ai-sdk.svg)](https://www.npmjs.com/package/@dakera-ai/ai-sdk)
[![CI](https://github.com/dakera-ai/dakera-ai-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/dakera-ai/dakera-ai-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)

Vercel AI SDK integration for [Dakera](https://dakera.ai) — a self-hosted memory server that adds **persistent, decay-weighted vector recall** across agent sessions.

Memories are importance-scored and decay over time, so stale context stops competing with fresh, relevant facts. The integration plugs into the AI SDK's two standard extension points — **language model middleware** and **tools** — so you can add cross-session memory to any AI SDK app without changing your model or provider code.

## Quick start

```bash
npm install @dakera-ai/ai-sdk ai @dakera-ai/dakera zod
```

Run a Dakera server first (self-hosted, zero external dependencies):

```bash
# Docker Compose — server + MinIO object storage
curl -sSL https://raw.githubusercontent.com/dakera-ai/dakera-deploy/main/docker-compose.yml | \
  docker compose -f - up -d
```

Then set two environment variables:

```bash
export DAKERA_URL=http://localhost:3000   # default — can omit
export DAKERA_API_KEY=dk-your-key-here
```

## Pattern 1 — Memory middleware (transparent)

`createDakeraMemoryMiddleware` wraps any language model. On every call it:

1. Recalls the most relevant memories for the current prompt
2. Injects them as a system message before generation
3. Stores the new exchange back into Dakera

Your generation code stays unchanged.

```typescript
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: createDakeraMemoryMiddleware({
    agentId: "user-1234",   // scopes memories to this agent / user
    recallK: 5,             // inject up to 5 relevant memories per call
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
// → "You're building Velox, a Rust vector database."
```

### Streaming

The middleware works with `streamText` unchanged:

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

### Middleware options

| Option | Type | Default | Description |
|---|---|---|---|
| `agentId` | `string` | — | Scopes stored/recalled memories **(required)** |
| `apiUrl` | `string` | `$DAKERA_URL` / `http://localhost:3000` | Dakera server URL |
| `apiKey` | `string` | `$DAKERA_API_KEY` | API key (`dk-...`) |
| `client` | `DakeraClient` | — | Pre-built client (overrides `apiUrl`/`apiKey`) |
| `recallK` | `number` | `5` | Memories to recall and inject per call |
| `minImportance` | `number` | `0` | Minimum importance score to recall (0 – 1) |
| `importance` | `number` | `0.7` | Importance assigned to stored memories (0 – 1) |
| `store` | `boolean` | `true` | Persist the exchange after generation |
| `header` | `string` | `"Relevant memories…"` | System-message header prepended to the memory block |

## Pattern 2 — Memory tools (model-driven)

`createDakeraTools` returns `recallMemory` and `storeMemory` tools. The model decides when to look something up or persist a new fact — useful for agentic workflows where explicit memory control improves quality.

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraTools } from "@dakera-ai/ai-sdk";

const tools = createDakeraTools({ agentId: "user-1234" });

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools,
  maxSteps: 4,
  prompt: "Remember that I prefer metric units. Then convert 5 miles to km.",
});
// Model calls storeMemory("User prefers metric units", importance 0.8),
// then answers: "5 miles = 8.047 km"
```

### Tool options

| Option | Type | Default | Description |
|---|---|---|---|
| `agentId` | `string` | — | Scopes stored/recalled memories **(required)** |
| `apiUrl` | `string` | `$DAKERA_URL` / `http://localhost:3000` | Dakera server URL |
| `apiKey` | `string` | `$DAKERA_API_KEY` | API key (`dk-...`) |
| `client` | `DakeraClient` | — | Pre-built client (overrides `apiUrl`/`apiKey`) |
| `recallK` | `number` | `5` | Default `topK` for the recall tool |
| `importance` | `number` | `0.7` | Default importance for the store tool |

## Pattern 3 — Combined (transparent + explicit)

Use the middleware for automatic continuity and the tools when you want the model to manage memory deliberately in the same call:

```typescript
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware, createDakeraTools } from "@dakera-ai/ai-sdk";
import { DakeraClient } from "@dakera-ai/dakera";

// Share one client instance across middleware and tools
const client = new DakeraClient({ baseUrl: process.env.DAKERA_URL! });
const agentId = "user-1234";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  // Recall automatically, but let tools handle persistence
  middleware: createDakeraMemoryMiddleware({ client, agentId, store: false }),
});

const tools = createDakeraTools({ client, agentId });

const { text } = await generateText({
  model,
  tools,
  maxSteps: 6,
  system:
    "You are a helpful assistant. Use storeMemory for facts the user will want remembered across sessions.",
  prompt: "My deadline for the Velox project is Friday the 11th.",
});
```

## Using a pre-built client

Share connection config across multiple agents or avoid repeating credentials:

```typescript
import { DakeraClient } from "@dakera-ai/dakera";
import { createDakeraMemoryMiddleware, createDakeraTools } from "@dakera-ai/ai-sdk";

const client = new DakeraClient({
  baseUrl: "http://my-dakera.internal:3000",
  apiKey: process.env.DAKERA_API_KEY,
});

// All agents share the same connection
const supportMiddleware = createDakeraMemoryMiddleware({ client, agentId: "support-bot" });
const salesTools = createDakeraTools({ client, agentId: "sales-bot" });
```

## Running the examples

```bash
git clone https://github.com/dakera-ai/dakera-ai-sdk
cd dakera-ai-sdk/examples
npm install
DAKERA_URL=http://localhost:3000 DAKERA_API_KEY=dk-dev npx tsx 01-middleware.ts
```

See [`examples/README.md`](examples/README.md) for all examples and prerequisites.

## Troubleshooting

**`Cannot find name 'process'`** — add `"types": ["node"]` to your `tsconfig.json` `compilerOptions`.

**Memory recall is empty on first call** — expected. The first call has no history. After the first exchange the store step runs, and subsequent calls will recall.

**Storage errors break my app** — they won't. The middleware catches all storage errors so a Dakera outage never interrupts generation.

**Getting 401 from the server** — verify `DAKERA_API_KEY` matches the server's env. Keys look like `dk-...` when generated via the Dakera admin API, but any shared string works.

**Using with Next.js / edge runtime** — set `DAKERA_URL` and `DAKERA_API_KEY` as Next.js environment variables and import from `@dakera-ai/ai-sdk` in server components or API routes.

## License

MIT © [Dakera](https://dakera.ai)
