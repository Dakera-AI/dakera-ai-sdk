/**
 * Example 2 — Memory tools (model-driven)
 *
 * `createDakeraTools` gives the model explicit `recallMemory` and `storeMemory`
 * tools. The model decides when to look something up or when to persist a fact.
 * Useful for agents that need deliberate memory management.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... DAKERA_API_KEY=dk-dev npx tsx 02-tools.ts
 */

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraTools } from "@dakera-ai/ai-sdk";

const tools = createDakeraTools({
  agentId: "example-user-2",
  recallK: 5,
  importance: 0.8,
});

console.log("=== Step 1: storing a preference ===");
const { text: reply1, steps: steps1 } = await generateText({
  model: openai("gpt-4o-mini"),
  tools,
  maxSteps: 3,
  prompt:
    "Please remember that I always want code examples in TypeScript, not JavaScript.",
});
console.log("Assistant:", reply1);
console.log("Tool calls:", steps1.flatMap((s) => s.toolCalls).map((c) => c.toolName));

console.log("\n=== Step 2: recalling the preference ===");
const { text: reply2, steps: steps2 } = await generateText({
  model: openai("gpt-4o-mini"),
  tools,
  maxSteps: 3,
  system:
    "You are a helpful coding assistant. Always check memory for user preferences before answering.",
  prompt: "Show me a quick example of how to read a file.",
});
console.log("Assistant:", reply2);
console.log("Tool calls:", steps2.flatMap((s) => s.toolCalls).map((c) => c.toolName));
// → Model should call recallMemory, find the TypeScript preference, and answer in TS
