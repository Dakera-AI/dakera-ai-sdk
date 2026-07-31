/**
 * Example 4 — Streaming with memory middleware
 *
 * `streamText` works with `wrapLanguageModel` unchanged. The middleware
 * automatically recalls memories before streaming begins and persists the
 * exchange (via `wrapStream`) once the stream flushes — no extra setup needed.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... DAKERA_API_KEY=dk-dev npx tsx 04-streaming.ts
 */

import { streamText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o-mini"),
  middleware: createDakeraMemoryMiddleware({
    agentId: "example-user-4",
    // store: true is the default — both streaming and non-streaming calls
    // persist memories automatically via wrapStream / wrapGenerate.
  }),
});

console.log("Streaming response with recalled context...\n");

const { textStream, finishReason } = streamText({
  model,
  prompt: "Tell me about my current project in a short paragraph.",
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}

console.log("\n\nFinish reason:", await finishReason);
