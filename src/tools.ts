/**
 * Dakera memory tools for the Vercel AI SDK.
 *
 * Unlike the middleware (which recalls/stores transparently), these tools hand
 * memory control to the language model: it decides when to recall prior context
 * and when to persist a durable fact, via ordinary AI SDK tool calls.
 *
 * @example
 * ```typescript
 * import { generateText } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { createDakeraTools } from "@dakera-ai/ai-sdk";
 *
 * const tools = createDakeraTools({ apiUrl: "http://localhost:3000", agentId: "my-agent" });
 * const { text } = await generateText({
 *   model: openai("gpt-4o"),
 *   tools,
 *   prompt: "What did I tell you about my project last week?",
 * });
 * ```
 */
import { tool } from "ai";
import { z } from "zod";
import { resolveClient, type DakeraConnectionOptions } from "./client.js";

export interface DakeraToolsOptions extends DakeraConnectionOptions {
  /** Agent identifier that scopes stored and recalled memories. */
  agentId: string;
  /** Default number of memories returned by the recall tool (default: 5). */
  recallK?: number;
  /** Default importance for the store tool when the model omits it (default: 0.7). */
  importance?: number;
}

/**
 * Create `recallMemory` and `storeMemory` tools bound to a Dakera agent.
 * Spread the returned object into the `tools` field of `generateText`/`streamText`.
 */
export function createDakeraTools(options: DakeraToolsOptions) {
  const client = resolveClient(options);
  const agentId = options.agentId;
  const recallK = options.recallK ?? 5;
  const defaultImportance = options.importance ?? 0.7;

  const recallMemory = tool({
    description:
      "Recall relevant facts the user shared in earlier sessions. Call this before answering questions that may depend on prior context.",
    inputSchema: z.object({
      query: z.string().describe("What to search for in memory"),
      topK: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of memories to return"),
    }),
    execute: async ({ query, topK }) => {
      const { memories } = await client.recall(agentId, query, {
        top_k: topK ?? recallK,
      });
      return memories.map((m) => ({
        content: m.content,
        importance: m.importance,
        score: m.score,
      }));
    },
  });

  const storeMemory = tool({
    description:
      "Persist a durable fact about the user or task so it can be recalled in future sessions.",
    inputSchema: z.object({
      content: z.string().describe("The fact to remember"),
      importance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Importance weight from 0 (trivial) to 1 (critical)"),
    }),
    execute: async ({ content, importance }) => {
      const res = await client.storeMemory(agentId, {
        content,
        importance: importance ?? defaultImportance,
      });
      return { id: res.memory.id, status: "stored" as const };
    },
  });

  return { recallMemory, storeMemory };
}
