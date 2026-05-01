import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const shutdownMock = vi.fn();

vi.mock("cassandra-driver", () => {
  class ClientMock {
    execute = executeMock;
    shutdown = shutdownMock;
  }

  return {
    Client: ClientMock,
    auth: {
      PlainTextAuthProvider: vi.fn(),
    },
  };
});

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("partitioned Cassandra message streams", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T00:00:00.000Z"));
    executeMock.mockReset();
    shutdownMock.mockReset();
  });

  afterEach(async () => {
    const { shutdownCassandra } = await import("./queries");
    await shutdownCassandra();
    vi.useRealTimers();
  });

  it("keeps partition scan workers balanced across entities instead of draining one entity at a time", async () => {
    let resolveFirst: ((value: { rows: never[]; pageState: null }) => void) | null = null;
    let resolveSecond: ((value: { rows: never[]; pageState: null }) => void) | null = null;

    executeMock.mockImplementation((query: string, params: unknown[]) => {
      void query;
      const [entityId, bucket] = params as [string, string];
      if (entityId === "c1" && bucket === "202603") {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      if (entityId === "c2" && bucket === "202603") {
        return new Promise((resolve) => {
          resolveSecond = resolve;
        });
      }
      return Promise.resolve({ rows: [], pageState: null });
    });

    const { streamAllMessagesFromChats } = await import("./queries");
    const drain = (async () => {
      for await (const _page of streamAllMessagesFromChats(["c1", "c2", "c3"], {
        fetchSize: 100,
        concurrency: 2,
        bucketStartYear: 2026,
        bucketStartMonth: 3,
      })) {
        // no-op
      }
    })();

    await tick();
    expect(executeMock.mock.calls.slice(0, 2).map((call) => call[1])).toEqual([
      ["c1", "202603"],
      ["c2", "202603"],
    ]);

    resolveFirst?.({ rows: [], pageState: null });
    await tick();
    expect(executeMock.mock.calls[2]?.[1]).toEqual(["c3", "202603"]);

    resolveSecond?.({ rows: [], pageState: null });
    await drain;
  });

  it("reads bucketed user and chat messages newest first", async () => {
    executeMock.mockResolvedValue({ rows: [], pageState: null });

    const {
      listMessagesByChatBucket,
      listMessagesByChatBucketForUser,
      listMessagesByIdForUser,
      listMessagesByUserBucket,
    } = await import("./queries");

    await listMessagesByUserBucket("u1", "202605", 10);
    await listMessagesByChatBucket("c1", "202605", 10);
    await listMessagesByChatBucketForUser("c1", "202605", "u1", 10);
    await listMessagesByIdForUser("u1", 10);

    expect(executeMock.mock.calls[0]?.[0]).toContain("FROM messages_by_user");
    expect(executeMock.mock.calls[0]?.[0]).toContain("ORDER BY timestamp DESC");
    expect(executeMock.mock.calls[0]?.[1]).toEqual(["u1", "202605", 10]);
    expect(executeMock.mock.calls[1]?.[0]).toContain("FROM messages_by_chat");
    expect(executeMock.mock.calls[1]?.[0]).toContain("ORDER BY timestamp DESC");
    expect(executeMock.mock.calls[1]?.[1]).toEqual(["c1", "202605", 10]);
    expect(executeMock.mock.calls[2]?.[0]).toContain("FROM messages_by_chat");
    expect(executeMock.mock.calls[2]?.[0]).toContain("user_id = ?");
    expect(executeMock.mock.calls[2]?.[1]).toEqual(["c1", "202605", "u1", 10]);
    expect(executeMock.mock.calls[3]?.[0]).toContain("FROM messages_by_id");
    expect(executeMock.mock.calls[3]?.[0]).toContain("user_id = ?");
    expect(executeMock.mock.calls[3]?.[1]).toEqual(["u1", 10]);
  });
});
