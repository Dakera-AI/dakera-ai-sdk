/**
 * Dakera memory middleware for the Vercel AI SDK.
 *
 * Wraps any language model so that, on every call, relevant memories from
 * previous sessions are recalled and injected as system context, and the new
 * exchange is stored back into Dakera — transparently, with no changes to the
 * model or the calling code.
 *
 * @example
 * ```typescript
 * import { wrapLanguageModel } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { createDakeraMemoryMiddleware } from "@dakera-ai/ai-sdk";
 *
 * const model = wrapLanguageModel({
 *   model: openai("gpt-4o"),
 *   middleware: createDakeraMemoryMiddleware({
 *     apiUrl: "http://localhost:3000",
 *     apiKey: "dk-...",
 *     agentId: "my-agent",
 *   }),
 * });
 * ```
 */
import type {
  LanguageModelV3Middleware,
  LanguageModelV3Prompt,
} from "@ai-sdk/provider";
import { resolveClient, type DakeraConnectionOptions } from "./client.js";

export interface DakeraMemoryMiddlewareOptions extends DakeraConnectionOptions {
  /** Agent identifier that scopes stored and recalled memories. */
  agentId: string;
  /** Number of memories to recall and inject per call (default: 5). */
  recallK?: number;
  /** Minimum importance score for recalled memories (default: 0). */
  minImportance?: number;
  /** Importance assigned to memories stored after each call (default: 0.7). */
  importance?: number;
  /** Whether to store the exchange after generation (default: true). */
  store?: boolean;
  /** Header prepended to the injected memory block. */
  header?: string;
}

const DEFAULT_HEADER =
  "Relevant memories from previous sessions (use them if helpful):";

/** Extract the text of the most recent user message in a prompt. */
function lastUserText(prompt: LanguageModelV3Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message && message.role === "user") {
      return message.content
        .filter((part): part is Extract<typeof part, { type: "text" }> =>
          part.type === "text",
        )
        .map((part) => part.text)
        .join(" ")
        .trim();
    }
  }
  return "";
}

/**
 * Create a Vercel AI SDK middleware that backs a language model with Dakera
 * persistent memory. Pass the result to `wrapLanguageModel({ model, middleware })`.
 */
export function createDakeraMemoryMiddleware(
  options: DakeraMemoryMiddlewareOptions,
): LanguageModelV3Middleware {
  const client = resolveClient(options);
  const agentId = options.agentId;
  const recallK = options.recallK ?? 5;
  const minImportance = options.minImportance ?? 0;
  const importance = options.importance ?? 0.7;
  const shouldStore = options.store ?? true;
  const header = options.header ?? DEFAULT_HEADER;

  return {
    specificationVersion: "v3",

    async transformParams({ params }) {
      const query = lastUserText(params.prompt);
      if (!query) {
        return params;
      }
      const { memories } = await client.recall(agentId, query, {
        top_k: recallK,
        min_importance: minImportance,
      });
      if (!memories || memories.length === 0) {
        return params;
      }
      const block = [header, ...memories.map((m) => `- ${m.content}`)].join("\n");
      const prompt: LanguageModelV3Prompt = [
        { role: "system", content: block },
        ...params.prompt,
      ];
      return { ...params, prompt };
    },

    async wrapGenerate({ doGenerate, params }) {
      const result = await doGenerate();
      if (!shouldStore) {
        return result;
      }
      // Persisting memory must never break generation — degrade gracefully.
      try {
        const query = lastUserText(params.prompt);
        const answer = result.content
          .filter((part): part is Extract<typeof part, { type: "text" }> =>
            part.type === "text",
          )
          .map((part) => part.text)
          .join("")
          .trim();
        if (query) {
          await client.storeMemory(agentId, {
            content: `User: ${query}`,
            importance,
          });
        }
        if (answer) {
          await client.storeMemory(agentId, {
            content: `Assistant: ${answer}`,
            importance,
          });
        }
      } catch {
        // Swallow storage errors: memory is best-effort, generation is not.
      }
      return result;
    },
  };
}
