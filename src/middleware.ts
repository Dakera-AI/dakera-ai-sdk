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
import type { LanguageModelMiddleware } from "ai";
import {
  isUnknownAgent,
  rankedMemories,
  resolveClient,
  type DakeraConnectionOptions,
} from "./client.js";

export interface DakeraMemoryMiddlewareOptions extends DakeraConnectionOptions {
  /** Agent identifier that scopes stored and recalled memories. */
  agentId: string;
  /** Maximum number of memories to recall and inject per call (default: 5). */
  recallK?: number;
  /** Minimum importance score for recalled memories (default: 0). */
  minImportance?: number;
  /** Importance assigned to memories stored after each call (default: 0.7). */
  importance?: number;
  /** Whether to store the exchange after generation (default: true). */
  store?: boolean;
  /** Header prepended to the injected memory block. */
  header?: string;
  /**
   * Called with an error the middleware absorbed. Memory is best-effort: when a
   * recall fails the model is called without memories, when a store fails the
   * result is returned as is — a Dakera outage never fails a generation. Use
   * this to log or count those errors (default: ignore them).
   */
  onError?: (error: unknown, operation: "recall" | "store") => void;
}

const DEFAULT_HEADER =
  "Relevant memories from previous sessions (use them if helpful):";

// The shapes the middleware reads, derived from the installed `ai`: the model
// call's prompt, a generated result's content and a stream part. They are the
// same in the v3 (AI SDK 6) and v4 (AI SDK 7) model specifications.
type Middleware = Required<LanguageModelMiddleware>;
type CallOptions = Parameters<Middleware["transformParams"]>[0]["params"];
type Prompt = CallOptions["prompt"];
type GenerateResult = Awaited<ReturnType<Parameters<Middleware["wrapGenerate"]>[0]["doGenerate"]>>;
type StreamResult = Awaited<ReturnType<Parameters<Middleware["wrapStream"]>[0]["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/** Extract the text of the most recent user message in a prompt. */
function lastUserText(prompt: Prompt): string {
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
 *
 * Before each call it recalls up to `recallK` memories relevant to the last
 * user message and prepends them as a system message; after a `generateText`
 * call, or once a `streamText` stream has finished, it stores the user message
 * and the answer as two memories (unless `store: false`).
 */
export function createDakeraMemoryMiddleware(
  options: DakeraMemoryMiddlewareOptions,
): LanguageModelMiddleware {
  const client = resolveClient(options);
  const agentId = options.agentId;
  const recallK = options.recallK ?? 5;
  const minImportance = options.minImportance ?? 0;
  const importance = options.importance ?? 0.7;
  const shouldStore = options.store ?? true;
  const header = options.header ?? DEFAULT_HEADER;
  const reportError = (error: unknown, operation: "recall" | "store"): void => {
    try {
      options.onError?.(error, operation);
    } catch {
      // A failing error handler must not fail the generation either.
    }
  };

  return {
    specificationVersion: "v3",

    async transformParams({ params }) {
      const query = lastUserText(params.prompt);
      if (!query) {
        return params;
      }
      let recalled;
      try {
        recalled = await client.recall(agentId, query, {
          top_k: recallK,
          min_importance: minImportance,
          neighborhood_mode: "separate",
        });
      } catch (err) {
        if (!isUnknownAgent(err)) {
          reportError(err, "recall");
        }
        return params;
      }
      const memories = rankedMemories(recalled.memories, recallK);
      if (memories.length === 0) {
        return params;
      }
      const block = [header, ...memories.map((m) => `- ${m.content}`)].join("\n");
      const prompt: Prompt = [
        { role: "system", content: block },
        ...params.prompt,
      ];
      return { ...params, prompt };
    },

    async wrapGenerate({ doGenerate, params }) {
      const result: GenerateResult = await doGenerate();
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
      } catch (err) {
        // Memory is best-effort, generation is not.
        reportError(err, "store");
      }
      return result;
    },

    async wrapStream({ doStream, params }) {
      const result = await doStream();
      if (!shouldStore) {
        return result;
      }
      const query = lastUserText(params.prompt);
      let answer = "";
      const wrappedStream = result.stream.pipeThrough(
        new TransformStream<StreamPart, StreamPart>({
          transform(chunk, controller) {
            if (chunk.type === "text-delta") {
              answer += chunk.delta;
            }
            controller.enqueue(chunk);
          },
          async flush() {
            try {
              if (query) {
                await client.storeMemory(agentId, {
                  content: `User: ${query}`,
                  importance,
                });
              }
              if (answer.trim()) {
                await client.storeMemory(agentId, {
                  content: `Assistant: ${answer.trim()}`,
                  importance,
                });
              }
            } catch (err) {
              // Memory is best-effort, streaming is not.
              reportError(err, "store");
            }
          },
        }),
      );
      return { ...result, stream: wrappedStream };
    },
  };
}
