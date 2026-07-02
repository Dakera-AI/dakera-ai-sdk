/**
 * Example 4 — Streaming with memory middleware
 *
 * `streamText` works with `wrapLanguageModel` unchanged. Memories are recalled
 * and injected before streaming begins. Note: the middleware's `wrapGenerate`
 * hook only fires for non-streaming calls; for streaming, use the tools pattern
 * (02-tools.ts) or a separate store step if you need persistence.
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
    store: false, // disable auto-store for streaming; handle explicitly if needed
  }),
});

console.log("Streaming response with recalled context...\n");

const { textStream, finishReason } = streamText({
  model,
  prompt: "Tell me about my current project in a short paragraph.",
});

let fullText = "";
for await (const chunk of textStream) {
  process.stdout.write(chunk);
  fullText += chunk;
}

console.log("\n\nFinish reason:", await finishReason);

// Optionally persist after streaming completes
// import { DakeraClient } from "@dakera-ai/dakera";
// const client = new DakeraClient({ ... });
// await client.storeMemory("example-user-4", { content: `Assistant: ${fullText}`, importance: 0.7 });
