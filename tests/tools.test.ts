import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, NotFoundError } from "@dakera-ai/dakera";
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
    expect(client.recall).toHaveBeenCalledWith("test-agent", "where do I live?", { top_k: 5, neighborhood_mode: "separate" });
    expect(out).toEqual([{ content: "User lives in Berlin", importance: 0.8, score: 0.91 }]);
  });

  it("recallMemory honours a per-call topK", async () => {
    const tools = createDakeraTools({ agentId: "a", client: client as never, recallK: 5 });
    await tools.recallMemory.execute!({ query: "x", topK: 12 }, execOpts);
    expect(client.recall).toHaveBeenCalledWith("a", "x", { top_k: 12, neighborhood_mode: "separate" });
  });

  it("recallMemory returns at most topK ranked memories, without neighbourhood context", async () => {
    // A server before v0.12.3 ignores neighborhood_mode and appends the context inline.
    client.recall.mockResolvedValueOnce({
      memories: [
        { content: "first", importance: 0.5, score: 0.9 },
        { content: "context", importance: 0.5, score: 0, retrieval: "neighborhood" },
        { content: "second", importance: 0.5, score: 0.8 },
        { content: "third", importance: 0.5, score: 0.7 },
      ],
    });
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    const out = await tools.recallMemory.execute!({ query: "x", topK: 2 }, execOpts);
    expect(out).toEqual([
      { content: "first", importance: 0.5, score: 0.9 },
      { content: "second", importance: 0.5, score: 0.8 },
    ]);
  });

  it("storeMemory sends a model-supplied eventTime as event_time", async () => {
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    await tools.storeMemory.execute!(
      { content: "moved to Berlin", eventTime: "2026-05-20T14:00:00Z" },
      execOpts,
    );
    expect(client.storeMemory).toHaveBeenCalledWith("a", {
      content: "moved to Berlin",
      importance: 0.7,
      event_time: "2026-05-20T14:00:00Z",
    });
  });

  it("storeMemory's schema accepts an ISO 8601 eventTime with offset and rejects others", () => {
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    const schema = tools.storeMemory.inputSchema as unknown as {
      safeParse: (v: unknown) => { success: boolean };
    };
    expect(schema.safeParse({ content: "x", eventTime: "2026-05-20T14:00:00+02:00" }).success).toBe(true);
    expect(schema.safeParse({ content: "x", eventTime: "last Tuesday" }).success).toBe(false);
    expect(schema.safeParse({ content: "x" }).success).toBe(true);
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

  it("recallMemory uses recallK option as default when no per-call topK", async () => {
    const tools = createDakeraTools({ agentId: "a", client: client as never, recallK: 8 });
    await tools.recallMemory.execute!({ query: "x" }, execOpts);
    expect(client.recall).toHaveBeenCalledWith("a", "x", { top_k: 8, neighborhood_mode: "separate" });
  });

  it("recallMemory propagates errors from client.recall", async () => {
    client.recall.mockRejectedValue(new Error("network error"));
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    await expect(
      tools.recallMemory.execute!({ query: "x" }, execOpts),
    ).rejects.toThrow("network error");
  });

  it("recallMemory returns no memories for an agent an older server does not know yet", async () => {
    client.recall.mockRejectedValue(
      new NotFoundError("Namespace not found: _dakera_agent_a", 404, undefined, ErrorCode.NAMESPACE_NOT_FOUND),
    );
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    expect(await tools.recallMemory.execute!({ query: "x" }, execOpts)).toEqual([]);
  });

  it("storeMemory propagates errors from client.storeMemory", async () => {
    client.storeMemory.mockRejectedValue(new Error("store failed"));
    const tools = createDakeraTools({ agentId: "a", client: client as never });
    await expect(
      tools.storeMemory.execute!({ content: "fact" }, execOpts),
    ).rejects.toThrow("store failed");
  });
});
