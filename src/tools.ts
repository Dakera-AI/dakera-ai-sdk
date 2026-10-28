/**
 * Dakera memory tools for the Vercel AI SDK.
 *
 * Unlike the middleware (which recalls/stores transparently), these tools hand
 * memory control to the language model: it decides when to recall prior context
 * and when to persist a durable fact, via ordinary AI SDK tool calls.
 *
 * @example
 * ```typescript
 * import { generateText, stepCountIs } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { createDakeraTools } from "@dakera-ai/ai-sdk";
 *
 * const tools = createDakeraTools({ apiUrl: "http://localhost:3000", agentId: "my-agent" });
 * const { text } = await generateText({
 *   model: openai("gpt-4o"),
 *   tools,
 *   stopWhen: stepCountIs(3), // let the model call a tool, then answer
 *   prompt: "What did I tell you about my project last week?",
 * });
 * ```
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  isUnknownAgent,
  rankedMemories,
  resolveClient,
  type DakeraConnectionOptions,
} from "./client.js";

export interface DakeraToolsOptions extends DakeraConnectionOptions {
  /** Agent identifier that scopes stored and recalled memories. */
  agentId: string;
  /** Default number of memories returned by the recall tool (default: 5). */
  recallK?: number;
  /** Default importance for the store tool when the model omits it (default: 0.7). */
  importance?: number;
}

/**
 * Create `recallMemory` and `storeMemory` tools bound to a Dakera agent. Pass
 * the returned object as the `tools` of `generateText` / `streamText` (or
 * spread it next to your own tools).
 *
 * - `recallMemory({ query, topK? })` returns at most `topK` (default `recallK`)
 *   memories, best first, as `{ content, importance, score }`.
 * - `storeMemory({ content, importance?, eventTime? })` stores one memory and
 *   returns `{ id, status: "stored" }`.
 *
 * Errors of the Dakera client (other than recalling an agent that has stored
 * nothing yet) are thrown from the tool, which the AI SDK reports to the model
 * as a tool error.
 */
export function createDakeraTools(options: DakeraToolsOptions): ToolSet {
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
    execute: async ({ query, topK }): Promise<
      Array<{ content: string; importance: number; score: number }>
    > => {
      const limit = topK ?? recallK;
      let recalled;
      try {
        recalled = await client.recall(agentId, query, {
          top_k: limit,
          neighborhood_mode: "separate",
        });
      } catch (err) {
        if (isUnknownAgent(err)) {
          return [];
        }
        throw err;
      }
      return rankedMemories(recalled.memories, limit).map((m) => ({
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
      eventTime: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe(
          "When the fact happened, as an ISO 8601 date-time (e.g. 2026-05-20T14:00:00Z). Omit when it is happening now.",
        ),
    }),
    execute: async ({
      content,
      importance,
      eventTime,
    }): Promise<{ id: string; status: "stored" }> => {
      const res = await client.storeMemory(agentId, {
        content,
        importance: importance ?? defaultImportance,
        ...(eventTime !== undefined ? { event_time: eventTime } : {}),
      });
      return { id: res.memory.id, status: "stored" as const };
    },
  });

  return { recallMemory, storeMemory };
}
