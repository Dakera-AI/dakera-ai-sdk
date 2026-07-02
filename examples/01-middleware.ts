/**
 * Example 1 — Memory middleware (transparent)
 *
 * The middleware wraps a language model and automatically recalls relevant
 * memories before each call, then stores the new exchange afterwards.
 * Your generation code needs no changes.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... DAKERA_API_KEY=dk-dev npx tsx 01-middleware.ts
 */

import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";

const model = wrapLanguageModel({
  model: openai("gpt-4o-mini"),
  middleware: createDakeraMemoryMiddleware({
    // Scope memories to a user or agent ID
    agentId: "example-user-1",
    // Recall up to 5 relevant memories per call
    recallK: 5,
    // Assign importance 0.8 to stored exchanges
    importance: 0.8,
  }),
});

console.log("=== Session 1: storing a fact ===");
const { text: reply1 } = await generateText({
  model,
  prompt:
    "My name is Alex and I'm building a distributed key-value store called Kestrel in Go.",
});
console.log("Assistant:", reply1);

console.log("\n=== Session 2: recalling across a simulated restart ===");
// In a real app this would be a separate process or later request.
// The memory persists in Dakera between sessions.
const { text: reply2 } = await generateText({
  model,
  prompt: "What do you know about my current project?",
});
console.log("Assistant:", reply2);
// → Should reference Kestrel and Alex without any explicit context in the prompt
