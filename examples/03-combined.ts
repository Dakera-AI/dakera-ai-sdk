/**
 * Example 3 — Combined middleware + tools
 *
 * Use the middleware for automatic recall (so the model always has relevant
 * context) and the tools when you want the model to persist facts explicitly.
 * A single DakeraClient is shared to avoid duplicate connections.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... DAKERA_API_KEY=dk-dev npx tsx 03-combined.ts
 */

import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { DakeraClient } from "@dakera-ai/dakera";
import { createDakeraMemoryMiddleware, createDakeraTools } from "@dakera-ai/ai-sdk";

// Share one DakeraClient between middleware and tools
const client = new DakeraClient({
  baseUrl: process.env["DAKERA_URL"] ?? "http://localhost:3000",
  apiKey: process.env["DAKERA_API_KEY"],
});
const agentId = "example-user-3";

// Middleware handles recall automatically; store: false lets the model
// decide what's worth persisting via the storeMemory tool
const model = wrapLanguageModel({
  model: openai("gpt-4o-mini"),
  middleware: createDakeraMemoryMiddleware({ client, agentId, store: false }),
});

const tools = createDakeraTools({ client, agentId });

console.log("=== Turn 1: model decides what to remember ===");
const { text: reply1, steps: steps1 } = await generateText({
  model,
  tools,
  maxSteps: 4,
  system:
    "You are a helpful assistant. Use storeMemory only for facts the user will want in future sessions (not transient conversation details).",
  prompt:
    "I'm Jordan. My preferred stack is Next.js + Postgres and my timezone is UTC+2.",
});
console.log("Assistant:", reply1);
console.log("Stored:", steps1.flatMap((s) => s.toolCalls).filter((c) => c.toolName === "storeMemory").length, "memories");

console.log("\n=== Turn 2: middleware injects recalled memories automatically ===");
const { text: reply2 } = await generateText({
  model,
  tools,
  maxSteps: 2,
  prompt: "What stack should I use for my next project?",
});
console.log("Assistant:", reply2);
// → Should reference Next.js + Postgres from memory without any explicit context
