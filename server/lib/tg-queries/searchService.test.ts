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
  configureSearchIndices: vi.fn(),
  getSearchBackend: vi.fn(),
  searchIndex: vi.fn(),
}));

const searchIndexingMocks = vi.hoisted(() => ({
  getActiveSearchShadowIndex: vi.fn(),
}));

vi.mock("../db", () => ({
  sql: dbMocks.sql,
}));

vi.mock("../db/searchIndexing", () => ({
  getActiveSearchShadowIndex: searchIndexingMocks.getActiveSearchShadowIndex,
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
  configureSearchIndices: searchIndexMocks.configureSearchIndices,
  getSearchBackend: searchIndexMocks.getSearchBackend,
  searchIndex: searchIndexMocks.searchIndex,
}));

const {
  buildMessageContextLink,
  getLookupMessage,
  runChannelSearch,
  runMessageSearch,
  runProfileSearch,
} = await import("./searchService");

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.sql.mockResolvedValue([]);
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
  searchIndexMocks.configureSearchIndices.mockResolvedValue(undefined);
  searchIndexMocks.getSearchBackend.mockReturnValue("opensearch");
  searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue(null);
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

describe("runMessageSearch", () => {
  it("falls back to shadow backing indexes when the live messages alias is empty", async () => {
    searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue(null);
    searchIndexMocks.searchIndex
      .mockResolvedValueOnce({
        hits: [],
        totalHits: 0,
      })
      .mockResolvedValueOnce({
        hits: [
          {
            documentId: "c1_m4",
            messageId: "m4",
            chatId: "c1",
            senderId: "u1",
            senderUsername: "alice",
            senderDisplayName: "Alice",
            chatTitle: "General",
            chatType: "group",
            chatUsername: "general",
            content: "shadow message result",
            contentCharacterSet: ["s", "h", "a", "d", "o", "w"],
            hasMedia: false,
            containsLinks: false,
            contentLength: 21,
            bucket: "202403",
            timestamp: "2024-03-10T12:00:00.000Z",
            timestampMs: 1710072000000,
          },
        ],
        totalHits: 1,
      });

    const result = await runMessageSearch(
      {
        type: "message",
        page: 1,
        limit: 25,
        query: "shadow",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      1,
      "messages",
      expect.objectContaining({ q: "shadow" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      2,
      "messages__shadow_*__backing_v1",
      expect.objectContaining({ q: "shadow" })
    );
    expect(result.total).toBe(1);
    expect(result.results[0]?.snippet).toContain("shadow");
  });

  it("uses exact character filters for single-character content searches", async () => {
    searchIndexMocks.searchIndex.mockResolvedValue({
      hits: [
        {
          documentId: "c1_m1",
          messageId: "m1",
          chatId: "c1",
          senderId: "u1",
          senderUsername: "alice",
          senderDisplayName: "Alice",
          chatTitle: "General",
          chatType: "group",
          chatUsername: "general",
          content: "hello there",
          contentCharacterSet: ["h", "e", "l", "o", "t", "r"],
          hasMedia: false,
          containsLinks: false,
          contentLength: 11,
          bucket: "202403",
          timestamp: "2024-03-10T12:00:00.000Z",
          timestampMs: 1710072000000,
        },
      ],
      totalHits: 1,
    });

    const result = await runMessageSearch(
      {
        type: "message",
        page: 1,
        limit: 25,
        query: "e",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.searchIndex).toHaveBeenCalledWith(
      "messages",
      expect.objectContaining({
        q: "",
        filters: expect.arrayContaining([
          { field: "contentCharacterSet", operator: "eq", value: "e" },
        ]),
        page: 1,
        hitsPerPage: 25,
      })
    );
    expect(result.total).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.snippet).toContain("e");
  });

  it("prefers the active shadow messages index while a full reindex is running", async () => {
    searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue("messages__shadow_run123");
    searchIndexMocks.searchIndex.mockResolvedValue({
      hits: [
        {
          documentId: "c1_m1",
          messageId: "m1",
          chatId: "c1",
          senderId: "u1",
          senderUsername: "alice",
          senderDisplayName: "Alice",
          chatTitle: "General",
          chatType: "group",
          chatUsername: "general",
          content: "shadow result",
          contentCharacterSet: ["s", "h", "a", "d", "o", "w"],
          hasMedia: false,
          containsLinks: false,
          contentLength: 13,
          bucket: "202403",
          timestamp: "2024-03-10T12:00:00.000Z",
          timestampMs: 1710072000000,
        },
      ],
      totalHits: 1,
    });

    const result = await runMessageSearch(
      {
        type: "message",
        page: 1,
        limit: 25,
        query: "shadow",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexingMocks.getActiveSearchShadowIndex).toHaveBeenCalledWith("messages");
    expect(searchIndexMocks.searchIndex).toHaveBeenCalledWith(
      "messages__shadow_run123",
      expect.objectContaining({
        q: "shadow",
      })
    );
    expect(result.total).toBe(1);
  });

  it("recovers from a stale shadow alias by probing the shadow backing index pattern", async () => {
    searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue("messages__shadow_stale");
    searchIndexMocks.searchIndex
      .mockRejectedValueOnce(new Error(
        'OpenSearch request failed (404): {"error":{"type":"index_not_found_exception","reason":"no such index [messages__shadow_stale]"}}'
      ))
      .mockResolvedValueOnce({
        hits: [],
        totalHits: 0,
      })
      .mockResolvedValueOnce({
        hits: [
          {
            documentId: "c1_m3",
            messageId: "m3",
            chatId: "c1",
            senderId: "u1",
            senderUsername: "alice",
            senderDisplayName: "Alice",
            chatTitle: "General",
            chatType: "group",
            chatUsername: "general",
            content: "rescued from shadow backing",
            contentCharacterSet: ["r", "e", "s", "c", "u", "d"],
            hasMedia: false,
            containsLinks: false,
            contentLength: 26,
            bucket: "202403",
            timestamp: "2024-03-10T12:00:00.000Z",
            timestampMs: 1710072000000,
          },
        ],
        totalHits: 1,
      });

    const result = await runMessageSearch(
      {
        type: "message",
        page: 1,
        limit: 25,
        query: "rescued",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      1,
      "messages__shadow_stale",
      expect.objectContaining({ q: "rescued" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      2,
      "messages",
      expect.objectContaining({ q: "rescued" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      3,
      "messages__shadow_*__backing_v1",
      expect.objectContaining({ q: "rescued" })
    );
    expect(result.total).toBe(1);
    expect(result.results[0]?.snippet).toContain("rescued");
  });

  it("reconfigures the messages index and retries when the new filterable attribute is missing", async () => {
    searchIndexMocks.searchIndex
      .mockRejectedValueOnce(new Error(
        'Meilisearch request failed (400): {"message":"Index `messages`: Attribute `contentCharacterSet` is not filterable."}'
      ))
      .mockResolvedValueOnce({
        hits: [
          {
            documentId: "c1_m2",
            messageId: "m2",
            chatId: "c1",
            senderId: "u1",
            senderUsername: "alice",
            senderDisplayName: "Alice",
            chatTitle: "General",
            chatType: "group",
            chatUsername: "general",
            content: "example",
            contentCharacterSet: ["e", "x", "a", "m", "p", "l"],
            hasMedia: false,
            containsLinks: false,
            contentLength: 7,
            bucket: "202403",
            timestamp: "2024-03-10T12:00:00.000Z",
            timestampMs: 1710072000000,
          },
        ],
        totalHits: 1,
      });

    const result = await runMessageSearch(
      {
        type: "message",
        page: 1,
        limit: 25,
        query: "e",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.configureSearchIndices).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.searchIndex).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(1);
  });

  it("keeps message hits when the query matches sender metadata rather than message content", async () => {
    searchIndexMocks.searchIndex.mockResolvedValue({
      hits: [
        {
          documentId: "c1_m5",
          messageId: "m5",
          chatId: "c1",
          senderId: "u1",
          senderUsername: "alice",
          senderDisplayName: "Alice",
          chatTitle: "General",
          chatType: "group",
          chatUsername: "general",
          content: "completely unrelated body text",
          contentCharacterSet: ["c", "o", "m", "p"],
          hasMedia: false,
          containsLinks: false,
          contentLength: 30,
          bucket: "202403",
          timestamp: "2024-03-10T12:00:00.000Z",
          timestampMs: 1710072000000,
        },
      ],
      totalHits: 1,
    });

    const result = await runMessageSearch(
      {
        type: "message",
        page: 1,
        limit: 25,
        query: "alice",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(result.total).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.sender.username).toBe("alice");
  });

  it("returns zero totals when loose index hits are filtered out for a multi-word message query", async () => {
    searchIndexMocks.searchIndex.mockResolvedValue({
      hits: [
        {
          documentId: "c1_m6",
          messageId: "m6",
          chatId: "c1",
          senderId: "u1",
          senderUsername: "alice",
          senderDisplayName: "Alice",
          chatTitle: "General",
          chatType: "group",
          chatUsername: "general",
          content: "i only",
          contentCharacterSet: ["i", "o", "n", "l", "y"],
          hasMedia: false,
          containsLinks: false,
          contentLength: 6,
          bucket: "202403",
          timestamp: "2024-03-10T12:00:00.000Z",
          timestampMs: 1710072000000,
        },
      ],
      totalHits: 16989542,
    });

    const result = await runMessageSearch(
      {
        type: "message",
        page: 1,
        limit: 25,
        query: "i shat",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });
});

describe("runChannelSearch", () => {
  it("falls back to shadow backing indexes when the live chats alias is empty", async () => {
    searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue(null);
    searchIndexMocks.searchIndex
      .mockResolvedValueOnce({
        hits: [],
        totalHits: 0,
      })
      .mockResolvedValueOnce({
        hits: [
          {
            chatId: "c1",
            chatType: "channel",
            username: "alpha",
            title: "Alpha Channel",
            description: "shadow channel result",
            memberCount: 42,
            participantCount: 42,
            profilePhoto: null,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-18T20:36:24.540Z",
            _rankingScore: 1,
          },
        ],
        totalHits: 1,
      });

    const result = await runChannelSearch(
      {
        type: "channel",
        page: 1,
        limit: 25,
        query: "alpha",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      1,
      "chats",
      expect.objectContaining({ q: "alpha" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      2,
      "chats__shadow_*__backing_v1",
      expect.objectContaining({ q: "alpha" })
    );
    expect(result.total).toBe(1);
    expect(result.results[0]?.username).toBe("alpha");
  });
});

describe("runProfileSearch", () => {
  it("falls back to shadow backing indexes when the live profile alias is empty", async () => {
    searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue(null);
    searchIndexMocks.searchIndex
      .mockResolvedValueOnce({
        hits: [],
        totalHits: 0,
      })
      .mockResolvedValueOnce({
        hits: [
          {
            userId: "u97",
            username: "skynara",
            displayName: "skynara",
            bio: null,
            profilePhoto: null,
            phoneHash: null,
            phoneMasked: null,
            createdAt: "2026-03-22T09:02:15.052Z",
            updatedAt: "2026-04-18T20:36:24.540Z",
            isTelegramPremium: null,
            _rankingScore: 1,
          },
        ],
        totalHits: 1,
      });

    const result = await runProfileSearch(
      {
        type: "profile",
        page: 1,
        limit: 25,
        query: "a",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      1,
      "profiles",
      expect.objectContaining({ q: "a" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      2,
      "profiles__shadow_*__backing_v1",
      expect.objectContaining({ q: "a" })
    );
    expect(result.total).toBe(1);
    expect(result.results[0]?.username).toBe("skynara");
  });

  it("falls back to older shadow backing indexes when the active running shadow is incomplete", async () => {
    searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue("profiles__shadow_current");
    searchIndexMocks.searchIndex
      .mockResolvedValueOnce({
        hits: [],
        totalHits: 0,
      })
      .mockResolvedValueOnce({
        hits: [],
        totalHits: 0,
      })
      .mockResolvedValueOnce({
        hits: [
          {
            userId: "u98",
            username: "Refundnet",
            displayName: "Squirrel ($12 Ftid in bio)",
            bio: null,
            profilePhoto: null,
            phoneHash: null,
            phoneMasked: null,
            createdAt: "2026-04-09T21:53:07.323Z",
            updatedAt: "2026-04-18T20:36:24.540Z",
            isTelegramPremium: null,
            _rankingScore: 1,
          },
        ],
        totalHits: 1,
      });

    const result = await runProfileSearch(
      {
        type: "profile",
        page: 1,
        limit: 25,
        query: "Refundnet",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      1,
      "profiles__shadow_current",
      expect.objectContaining({ q: "Refundnet" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      2,
      "profiles",
      expect.objectContaining({ q: "Refundnet" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      3,
      "profiles__shadow_*__backing_v1",
      expect.objectContaining({ q: "Refundnet" })
    );
    expect(result.total).toBe(1);
    expect(result.results[0]?.username).toBe("Refundnet");
  });

  it("recovers profile results from a shadow backing index when the tracked shadow alias is stale", async () => {
    searchIndexingMocks.getActiveSearchShadowIndex.mockResolvedValue("profiles__shadow_stale");
    searchIndexMocks.searchIndex
      .mockRejectedValueOnce(new Error(
        'OpenSearch request failed (404): {"error":{"type":"index_not_found_exception","reason":"no such index [profiles__shadow_stale]"}}'
      ))
      .mockResolvedValueOnce({
        hits: [],
        totalHits: 0,
      })
      .mockResolvedValueOnce({
        hits: [
          {
            userId: "u99",
            username: "Refundnet",
            displayName: "Squirrel ($12 Ftid in bio)",
            bio: null,
            profilePhoto: null,
            phoneHash: null,
            phoneMasked: null,
            createdAt: "2026-04-09T21:53:07.323Z",
            updatedAt: "2026-04-18T20:36:24.540Z",
            isTelegramPremium: null,
            _rankingScore: 1,
          },
        ],
        totalHits: 1,
      });

    const result = await runProfileSearch(
      {
        type: "profile",
        page: 1,
        limit: 25,
        query: "Refundnet",
        filters: {},
      },
      { viewer: { userId: "viewer-1", canBypassRedactions: false } } as any
    );

    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      1,
      "profiles__shadow_stale",
      expect.objectContaining({ q: "Refundnet" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      2,
      "profiles",
      expect.objectContaining({ q: "Refundnet" })
    );
    expect(searchIndexMocks.searchIndex).toHaveBeenNthCalledWith(
      3,
      "profiles__shadow_*__backing_v1",
      expect.objectContaining({ q: "Refundnet" })
    );
    expect(result.total).toBe(1);
    expect(result.results[0]?.username).toBe("Refundnet");
  });
});
