import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  getChatById: vi.fn(),
  getMessageByChatBucketTimestamp: vi.fn(),
  getMessageById: vi.fn(),
  getUserById: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserHistoryForBatch: vi.fn(),
  listChatsByIds: vi.fn(),
  formatMessageBucket: vi.fn((value: Date | string | null | undefined) => {
    if (!value) {
      return null;
    }
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return `${parsed.getUTCFullYear()}${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  }),
}));

const redactionMocks = vi.hoisted(() => ({
  applyResolvedRedaction: vi.fn((value) => value),
  buildRedactionMetadata: vi.fn(() => ({
    applied: false,
    type: "none",
    redactedFields: [],
    reason: null,
  })),
  loadRedactionMap: vi.fn(),
}));

const searchIndexMocks = vi.hoisted(() => ({
  searchIndex: vi.fn(),
}));

vi.mock("../db", () => ({
  sql: dbMocks.sql,
}));

vi.mock("./queries", () => ({
  getChatById: queryMocks.getChatById,
  getMessageByChatBucketTimestamp: queryMocks.getMessageByChatBucketTimestamp,
  getMessageById: queryMocks.getMessageById,
  getUserById: queryMocks.getUserById,
  getUserByUsername: queryMocks.getUserByUsername,
  getUserHistoryForBatch: queryMocks.getUserHistoryForBatch,
  listChatsByIds: queryMocks.listChatsByIds,
  formatMessageBucket: queryMocks.formatMessageBucket,
}));

vi.mock("./redactions", () => ({
  applyResolvedRedaction: redactionMocks.applyResolvedRedaction,
  buildRedactionMetadata: redactionMocks.buildRedactionMetadata,
  loadRedactionMap: redactionMocks.loadRedactionMap,
}));

vi.mock("./searchIndex", () => ({
  SEARCH_INDEXES: {
    profiles: "profiles",
    chats: "chats",
    messages: "messages",
  },
  searchIndex: searchIndexMocks.searchIndex,
}));

const { buildMessageContextLink, getLookupMessage } = await import("./searchService");

beforeEach(() => {
  vi.clearAllMocks();
  queryMocks.getMessageById.mockResolvedValue(null);
  queryMocks.getMessageByChatBucketTimestamp.mockResolvedValue(null);
  queryMocks.getChatById.mockResolvedValue({
    chat_id: "c1",
    chat_type: "group",
    display_name: "General",
    username: "general",
  });
  queryMocks.getUserById.mockResolvedValue({
    user_id: "u1",
    username: "alice",
    display_name: "Alice",
  });
  queryMocks.getUserByUsername.mockResolvedValue(null);
  queryMocks.getUserHistoryForBatch.mockResolvedValue(new Map());
  queryMocks.listChatsByIds.mockResolvedValue([]);
  redactionMocks.loadRedactionMap.mockResolvedValue(new Map());
});

describe("buildMessageContextLink", () => {
  it("includes bucket and timestamp hints for stable frontend navigation", () => {
    expect(
      buildMessageContextLink("c1", "m1", "202403", "2024-03-10T12:00:00.000Z")
    ).toBe("/lookup/message/c1/m1?bucket=202403&timestamp=2024-03-10T12%3A00%3A00.000Z");
  });
});

describe("getLookupMessage", () => {
  it("falls back to messages_by_chat when messages_by_id is incomplete", async () => {
    queryMocks.getMessageByChatBucketTimestamp.mockResolvedValue({
      chat_id: "c1",
      message_id: "m1",
      user_id: "u1",
      content: "hello from fallback",
      timestamp: new Date("2024-03-10T12:00:00.000Z"),
      bucket: "202403",
      has_media: false,
    });

    const result = await getLookupMessage(
      "c1",
      "m1",
      { viewer: { canBypassRedactions: false } } as any,
      { bucket: "202403", timestamp: "2024-03-10T12:00:00.000Z" }
    );

    expect(queryMocks.getMessageById).toHaveBeenCalledWith("c1", "m1");
    expect(queryMocks.getMessageByChatBucketTimestamp).toHaveBeenCalledTimes(1);
    expect(queryMocks.getMessageByChatBucketTimestamp.mock.calls[0]?.[0]).toBe("c1");
    expect(queryMocks.getMessageByChatBucketTimestamp.mock.calls[0]?.[1]).toBe("202403");
    expect(queryMocks.getMessageByChatBucketTimestamp.mock.calls[0]?.[2]).toBeInstanceOf(Date);
    expect(queryMocks.getMessageByChatBucketTimestamp.mock.calls[0]?.[2]?.toISOString()).toBe(
      "2024-03-10T12:00:00.000Z"
    );
    expect(queryMocks.getMessageByChatBucketTimestamp.mock.calls[0]?.[3]).toBe("m1");
    expect(result?.content).toBe("hello from fallback");
    expect(result?.contextLink).toBe(
      "/lookup/message/c1/m1?bucket=202403&timestamp=2024-03-10T12%3A00%3A00.000Z"
    );
  });
});
