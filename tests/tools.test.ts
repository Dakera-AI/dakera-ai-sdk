import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDakeraTools } from "../src/tools.js";

function fakeClient() {
  return {
    recall: vi.fn().mockResolvedValue({
      memories: [{ content: "User lives in Berlin", importance: 0.8, score: 0.91 }],
    }),
    storeMemory: vi.fn().mockResolvedValue({ memory: { id: "mem_42" } }),
  };
}

// Minimal ToolCallOptions stand-in for direct execute() invocation in tests.
const execOpts = { toolCallId: "call_1", messages: [] } as never;

describe("createDakeraTools", () => {
  let client: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    client = fakeClient();
  });

  it("exposes recallMemory and storeMemory tools", () => {
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    expect(tools.recallMemory).toBeDefined();
    expect(tools.storeMemory).toBeDefined();
  });

  it("recallMemory queries Dakera and maps results", async () => {
    const tools = createDakeraTools({ agentId: "test-agent", client: client as never });
    const out = await tools.recallMemory.execute!({ query: "where do I live?" }, execOpts);
    expect(client.recall).toHaveBeenCalledWith("test-agent", "where do I live?", { top_k: 5 });
    expect(out).toEqual([{ content: "User lives in Berlin", importance: 0.8, score: 0.91 }]);
  });

  it("recallMemory honours a per-call topK", async () => {
    const tools = createDakeraTools({ agentId: "a", client: client as never, recallK: 5 });
    await tools.recallMemory.execute!({ query: "x", topK: 12 }, execOpts);
    expect(client.recall).toHaveBeenCalledWith("a", "x", { top_k: 12 });
  });

  it("storeMemory persists a fact with default importance", async () => {
    const tools = createDakeraTools({ agentId: "test-agent", client: client as never });
    const out = await tools.storeMemory.execute!({ content: "User likes coffee" }, execOpts);
    expect(client.storeMemory).toHaveBeenCalledWith("test-agent", {
      content: "User likes coffee",
      importance: 0.7,
    });
    expect(out).toEqual({ id: "mem_42", status: "stored" });
  });

  it("storeMemory respects a model-supplied importance", async () => {
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    await tools.storeMemory.execute!({ content: "critical", importance: 0.95 }, execOpts);
    expect(client.storeMemory).toHaveBeenCalledWith("a", {
      content: "critical",
      importance: 0.95,
    });
  });
});
