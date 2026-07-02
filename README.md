# @dakera-ai/ai-sdk

Vercel AI SDK integration for [Dakera](https://dakera.ai) — a self-hosted memory
server that adds **persistent, decay-weighted vector recall** across sessions.
Memories are importance-scored and decay over time, so stale context stops
competing with fresh, relevant facts.

It plugs into the AI SDK's two standard extension points — **language model
middleware** and **tools** — so you can add cross-session memory to any AI SDK
app without changing your model or provider code.

## Install

```bash
npm install @dakera-ai/ai-sdk ai @dakera-ai/dakera zod
```

Run a Dakera server first (self-hosted, no external dependencies):
see [`dakera-ai/dakera-deploy`](https://github.com/dakera-ai/dakera-deploy) for
the Docker Compose setup (server + MinIO). Point the integration at it with
`DAKERA_URL` (default `http://localhost:3000`) and `DAKERA_API_KEY`.

## Pattern 1 — Memory middleware (transparent)

`createDakeraMemoryMiddleware` wraps a model so that relevant memories are
recalled and injected as system context before every call, and the new exchange
is stored afterwards. No changes to your generation code.

```typescript
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: createDakeraMemoryMiddleware({
    apiUrl: "http://localhost:3000",
    apiKey: process.env.DAKERA_API_KEY,
    agentId: "user-1234",
  }),
});

// First session
await generateText({ model, prompt: "I'm building a Rust vector database." });

// A later session — the model recalls the earlier context automatically
const { text } = await generateText({ model, prompt: "What am I working on?" });
// → "You're building a Rust vector database."
```

Under the hood the middleware uses `transformParams` to prepend recalled
memories as a system message, and `wrapGenerate` to persist the exchange.
Storage is best-effort: a memory-server error never breaks generation.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `agentId` | — | Identifier that scopes stored/recalled memories (required) |
| `apiUrl` | `$DAKERA_URL` / `http://localhost:3000` | Dakera server URL |
| `apiKey` | `$DAKERA_API_KEY` | Dakera API key (`dk-...`) |
| `client` | — | A pre-built `DakeraClient` (overrides `apiUrl`/`apiKey`) |
| `recallK` | `5` | Memories to recall per call |
| `minImportance` | `0` | Minimum importance to recall |
| `importance` | `0.7` | Importance assigned to stored memories |
| `store` | `true` | Store the exchange after generation |

## Pattern 2 — Memory tools (model-driven)

`createDakeraTools` gives the model explicit `recallMemory` and `storeMemory`
tools, so it decides when to look something up or remember it.

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraTools } from "@dakera-ai/ai-sdk";

const tools = createDakeraTools({ agentId: "user-1234" });

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools,
  maxSteps: 4,
  prompt: "Remember that I prefer metric units, then convert 5 miles to km.",
});
```

The two patterns compose — use the middleware for automatic continuity and the
tools when you want the model to manage memory deliberately.

## License

MIT © Dakera
