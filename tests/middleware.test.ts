import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDakeraMemoryMiddleware } from "../src/middleware.js";

// A minimal fake DakeraClient — passed via the `client` option so no live
// server or module mocking is required.
function fakeClient(recalled: Array<{ content: string; importance: number; score: number }>) {
  return {
    recall: vi.fn().mockResolvedValue({ memories: recalled }),
    storeMemory: vi.fn().mockResolvedValue({ memory: { id: "mem_1" } }),
  };
}

function userParams(text: string) {
  return {
    prompt: [{ role: "user", content: [{ type: "text", text }] }],
  } as never;
}

describe("createDakeraMemoryMiddleware", () => {
  let client: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    client = fakeClient([
      { content: "User prefers TypeScript", importance: 0.9, score: 0.88 },
    ]);
  });

  it("recalls with the last user message and injects a system memory block", async () => {
    const mw = createDakeraMemoryMiddleware({
      agentId: "test-agent",
      client: client as never,
    });
    const out = await mw.transformParams!({
      type: "generate",
      params: userParams("what language do I like?"),
      model: {} as never,
    });
    expect(client.recall).toHaveBeenCalledWith("test-agent", "what language do I like?", {
      top_k: 5,
      min_importance: 0,
    });
    const prompt = (out as { prompt: Array<{ role: string; content: string }> }).prompt;
    expect(prompt[0].role).toBe("system");
    expect(prompt[0].content).toContain("User prefers TypeScript");
    // Original user message is preserved after the injected system message.
    expect(prompt).toHaveLength(2);
  });

  it("passes through unchanged when there is no user text", async () => {
    const mw = createDakeraMemoryMiddleware({ agentId: "a", client: client as never });
    const params = { prompt: [{ role: "system", content: "hi" }] } as never;
    const out = await mw.transformParams!({ type: "generate", params, model: {} as never });
    expect(out).toBe(params);
    expect(client.recall).not.toHaveBeenCalled();
  });

  it("passes through unchanged when recall returns nothing", async () => {
    const empty = fakeClient([]);
    const mw = createDakeraMemoryMiddleware({ agentId: "a", client: empty as never });
    const params = userParams("anything");
    const out = await mw.transformParams!({ type: "generate", params, model: {} as never });
    expect((out as { prompt: unknown[] }).prompt).toHaveLength(1);
  });

  it("stores the user query and assistant answer after generation", async () => {
    const mw = createDakeraMemoryMiddleware({ agentId: "test-agent", client: client as never });
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "You like TypeScript." }],
    });
    await mw.wrapGenerate!({
      doGenerate,
      params: userParams("what do I like?"),
      model: {} as never,
      doStream: vi.fn() as never,
    });
    expect(client.storeMemory).toHaveBeenCalledWith("test-agent", {
      content: "User: what do I like?",
      importance: 0.7,
    });
    expect(client.storeMemory).toHaveBeenCalledWith("test-agent", {
      content: "Assistant: You like TypeScript.",
      importance: 0.7,
    });
  });

  it("does not store when store:false", async () => {
    const mw = createDakeraMemoryMiddleware({
      agentId: "a",
      client: client as never,
      store: false,
    });
    const doGenerate = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await mw.wrapGenerate!({
      doGenerate,
      params: userParams("hi"),
      model: {} as never,
      doStream: vi.fn() as never,
    });
    expect(client.storeMemory).not.toHaveBeenCalled();
  });

  it("never lets a storage failure break generation", async () => {
    client.storeMemory.mockRejectedValue(new Error("server down"));
    const mw = createDakeraMemoryMiddleware({ agentId: "a", client: client as never });
    const doGenerate = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const result = await mw.wrapGenerate!({
      doGenerate,
      params: userParams("hi"),
      model: {} as never,
      doStream: vi.fn() as never,
    });
    expect((result as { content: unknown[] }).content).toBeDefined();
  });
});
