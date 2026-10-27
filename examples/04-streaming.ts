/**
 * Example 4 — Streaming with memory middleware
 *
 * `streamText` works with `wrapLanguageModel` unchanged. The middleware
 * recalls memories before the stream starts and stores the exchange (via
 * `wrapStream`) once the stream has finished — no extra setup needed.
 *
 * Run (see README.md in this folder):
 *   OPENAI_API_KEY=sk-... DAKERA_URL=http://localhost:3000 DAKERA_API_KEY=dk-mykey npx tsx 04-streaming.ts
 */

import { streamText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o-mini"),
  middleware: createDakeraMemoryMiddleware({
    agentId: "example-user-4",
    // store: true is the default — streaming and non-streaming calls both
    // persist the exchange (via wrapStream / wrapGenerate).
    onError: (error, operation) => console.warn(`Dakera ${operation} failed:`, error),
  }),
});

async function stream(prompt: string): Promise<void> {
  console.log(`> ${prompt}`);
  const result = streamText({ model, prompt });
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  console.log(`\n(finish reason: ${await result.finishReason})\n`);
}

// The exchange is stored when the first stream finishes...
await stream("I'm writing a field guide to alpine plants, due in June.");
// ...so the second call recalls it.
await stream("Tell me about my current project in one sentence.");
