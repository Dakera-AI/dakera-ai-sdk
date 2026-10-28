/**
 * Live tests against a real Dakera server. Skipped unless DAKERA_API_URL is set:
 *
 *   docker run -d -p 3300:3300 -e DAKERA_PORT=3300 -e DAKERA_AUTH_ENABLED=false ghcr.io/dakera-ai/dakera:0.12.3
 *   DAKERA_API_URL=http://localhost:3300 npm test
 */
import { describe, it, expect } from "vitest";
import { generateText, streamText, wrapLanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { DakeraClient } from "@dakera-ai/dakera";
import { createDakeraMemoryMiddleware, createDakeraTools } from "../src/index.js";

// "" when unset: the suite is skipped, but its body still runs while tests are collected.
const apiUrl = process.env["DAKERA_API_URL"] ?? "";
const apiKey = process.env["DAKERA_API_KEY"];
const execOpts = { toolCallId: "call_1", messages: [] } as never;
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function agent(name: string): string {
  return `ai-sdk-it-${name}-${Date.now()}`;
}

/** A mock model that answers `reply` and records the prompts it was given. */
function mockModel(reply: string) {
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      return {
        content: [{ type: "text", text: reply }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      } as never;
    },
    doStream: async (options) => {
      prompts.push(options.prompt);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "t" });
            controller.enqueue({ type: "text-delta", id: "t", delta: reply });
            controller.enqueue({ type: "text-end", id: "t" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
            });
            controller.close();
          },
        }),
      } as never;
    },
  });
  return { model, prompts };
}

describe.skipIf(!apiUrl)("live Dakera server", () => {
  const client = new DakeraClient({ baseUrl: apiUrl, ...(apiKey ? { apiKey } : {}) });
  const conn = { apiUrl, ...(apiKey ? { apiKey } : {}) };

  it("middleware stores an exchange and recalls it on the next call", async () => {
    const agentId = agent("mw");
    const { model, prompts } = mockModel("Noted: you build Kestrel in Go.");
    const wrapped = wrapLanguageModel({
      model,
      middleware: createDakeraMemoryMiddleware({ ...conn, agentId, recallK: 2 }),
    });

    // A v0.12.3 server answers an agent that has stored nothing with no memories.
    await generateText({ model: wrapped, prompt: "I am building a key-value store called Kestrel in Go." });
    expect(JSON.stringify(prompts[0])).not.toContain("Relevant memories");

    await generateText({ model: wrapped, prompt: "What is Kestrel written in?" });
    const second = prompts[1] as Array<{ role: string; content: unknown }>;
    expect(second[0]?.role).toBe("system");
    const block = String(second[0]?.content);
    expect(block).toContain("Kestrel");
    // recallK bounds the injected block even when the session neighbourhood has more.
    expect(block.split("\n").filter((l) => l.startsWith("- ")).length).toBeLessThanOrEqual(2);
  });

  it("middleware stores a streamed exchange", async () => {
    const agentId = agent("stream");
    const { model } = mockModel("Berlin it is.");
    const wrapped = wrapLanguageModel({
      model,
      middleware: createDakeraMemoryMiddleware({ ...conn, agentId }),
    });
    const result = streamText({ model: wrapped, prompt: "I moved to Berlin last spring." });
    expect(await result.text).toBe("Berlin it is.");

    const deadline = Date.now() + 10_000;
    let contents: string[] = [];
    while (Date.now() < deadline) {
      contents = (await client.agentMemories(agentId)).map((m) => m.content);
      if (contents.length >= 2) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(contents).toContain("User: I moved to Berlin last spring.");
    expect(contents).toContain("Assistant: Berlin it is.");
  });

  it("store tool sends the event time", async () => {
    const agentId = agent("event");
    const tools = createDakeraTools({ ...conn, agentId });
    const stored = (await tools.storeMemory.execute!(
      { content: "The user moved to Berlin.", eventTime: "2025-04-01T09:00:00Z" },
      execOpts,
    )) as { id: string; status: string };
    expect(stored.status).toBe("stored");
    const memory = await client.getMemory(agentId, stored.id);
    expect(memory.metadata?.["_dakera_event_time"]).toBeDefined();
  });

  it("recall tool returns at most topK memories when the session has neighbours", async () => {
    const agentId = agent("topk");
    await client.startSession(agentId);
    const tools = createDakeraTools({ ...conn, agentId });
    for (let i = 0; i < 6; i++) {
      await tools.storeMemory.execute!(
        { content: `Fact ${i}: the user likes topic ${i} and colour blue` },
        execOpts,
      );
    }
    // Under the server's default inline mode this recall also returns session
    // neighbours of the ranked results (more than top_k items).
    const recalled = (await tools.recallMemory.execute!(
      { query: "colour blue", topK: 2 },
      execOpts,
    )) as Array<{ content: string; score: number }>;
    expect(recalled).toHaveLength(2);
    for (const m of recalled) expect(m.content).toContain("colour blue");
  });

  it("recall tool answers an agent that has stored nothing with no memories", async () => {
    const tools = createDakeraTools({ ...conn, agentId: agent("empty") });
    await expect(tools.recallMemory.execute!({ query: "anything" }, execOpts)).resolves.toEqual([]);
  });
});
