# Examples

Runnable examples for `@dakera-ai/ai-sdk`. Each file is standalone and runs with `tsx`.

## Prerequisites

1. A running Dakera server:

   ```bash
   docker run -d --name dakera -p 3000:3000 -e DAKERA_ROOT_API_KEY=dk-mykey ghcr.io/dakera-ai/dakera:0.12.3
   ```

2. An OpenAI API key — or swap `openai("gpt-4o-mini")` for any AI SDK provider's model.

3. The package built from this repository, and the examples' dependencies. `examples/package.json`
   installs `@dakera-ai/ai-sdk` from the repository root (`file:..`, copied in by `.npmrc`'s
   `install-links=true`), so build it first:

   ```bash
   # from the repository root
   npm install && npm run build
   cd examples && npm install
   ```

   After changing the package, rebuild it and run `npm install` here again.

## Running

```bash
export OPENAI_API_KEY=sk-...
export DAKERA_URL=http://localhost:3000   # the default
export DAKERA_API_KEY=dk-mykey             # omit for a server running without auth

npx tsx 01-middleware.ts
npx tsx 02-tools.ts
npx tsx 03-combined.ts
npx tsx 04-streaming.ts
```

`npm run typecheck` type-checks all of them (CI runs it from the root with `npm run typecheck:examples`).

| File | Pattern | Shows |
|---|---|---|
| [`01-middleware.ts`](01-middleware.ts) | Middleware | Transparent recall + store across two "sessions" |
| [`02-tools.ts`](02-tools.ts) | Tools | Model-driven memory with `recallMemory` / `storeMemory` and `stopWhen` |
| [`03-combined.ts`](03-combined.ts) | Combined | Middleware recall + tool-driven persistence with one shared client |
| [`04-streaming.ts`](04-streaming.ts) | Streaming | `streamText` with the middleware: stored when the stream ends, recalled next call; `onError` |
