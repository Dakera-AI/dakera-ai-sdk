# Examples

These are runnable examples for `@dakera-ai/ai-sdk`. Each file is standalone
and can be executed with `tsx` or compiled with `tsc`.

## Prerequisites

1. A running Dakera server — see [dakera-deploy](https://github.com/dakera-ai/dakera-deploy):

   ```bash
   curl -sSL https://raw.githubusercontent.com/dakera-ai/dakera-deploy/main/docker-compose.yml | \
     docker compose -f - up -d
   ```

2. An OpenAI API key (or swap for any AI SDK-compatible provider).

3. Install dependencies:

   ```bash
   npm install
   ```

## Running

```bash
# Set env vars
export OPENAI_API_KEY=sk-...
export DAKERA_URL=http://localhost:3000
export DAKERA_API_KEY=dk-dev          # or omit if your server runs without auth

# Run any example
npx tsx 01-middleware.ts
npx tsx 02-tools.ts
npx tsx 03-combined.ts
npx tsx 04-streaming.ts
```

## Examples

| File | Pattern | Description |
|---|---|---|
| `01-middleware.ts` | Middleware | Transparent recall + store across two "sessions" |
| `02-tools.ts` | Tools | Model-driven memory with `recallMemory` / `storeMemory` |
| `03-combined.ts` | Combined | Middleware recall + tool-driven persistence |
| `04-streaming.ts` | Streaming | `streamText` with memory middleware |
