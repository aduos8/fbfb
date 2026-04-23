import { beforeEach, describe, expect, it, vi } from "vitest";

const searchIndexMocks = vi.hoisted(() => ({
  configureSearchIndices: vi.fn(),
  deleteAllDocuments: vi.fn(),
  deleteIndex: vi.fn(),
  getBatch: vi.fn(),
  getIndexStats: vi.fn(),
  getOpenSearchSwapDetails: vi.fn(() => []),
  replaceDocuments: vi.fn(),
  swapIndexes: vi.fn(),
  updateDocuments: vi.fn(),
  waitForTask: vi.fn(),
}));

const dbSearchIndexingMocks = vi.hoisted(() => ({
  createSearchIndexRun: vi.fn(),
  getLatestResumableFullReindex: vi.fn(),
  getSearchIndexRun: vi.fn(),
  getSearchIndexRunByShadowHint: vi.fn(),
  markSearchIndexRunFailed: vi.fn(),
  markSearchIndexRunSucceeded: vi.fn(),
  updateSearchIndexRun: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
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
  getUserHistoryForBatch: vi.fn(),
  listAllChats: vi.fn(),
  listAllMessages: vi.fn(),
  listAllUsers: vi.fn(),
  listUsersByIds: vi.fn(),
  streamAllMessages: vi.fn(),
  streamAllMessagesFromChatTable: vi.fn(),
  streamAllMessagesFromChats: vi.fn(),
  streamAllMessagesFromUserTable: vi.fn(),
  streamAllMessagesFromUsers: vi.fn(),
}));

vi.mock("./searchIndex", () => ({
  SEARCH_INDEXES: {
    profiles: "profiles",
    chats: "chats",
    messages: "messages",
  },
  getSearchBackend: () => "meilisearch",
  getOpenSearchSwapDetails: searchIndexMocks.getOpenSearchSwapDetails,
  isTrackedSearchTaskId: (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value > 0,
  configureSearchIndices: searchIndexMocks.configureSearchIndices,
  deleteAllDocuments: searchIndexMocks.deleteAllDocuments,
  deleteIndex: searchIndexMocks.deleteIndex,
  getBatch: searchIndexMocks.getBatch,
  getIndexStats: searchIndexMocks.getIndexStats,
  replaceDocuments: searchIndexMocks.replaceDocuments,
  swapIndexes: searchIndexMocks.swapIndexes,
  updateDocuments: searchIndexMocks.updateDocuments,
  waitForTask: searchIndexMocks.waitForTask,
}));

vi.mock("../db/searchIndexing", () => ({
  createSearchIndexRun: dbSearchIndexingMocks.createSearchIndexRun,
  getLatestResumableFullReindex: dbSearchIndexingMocks.getLatestResumableFullReindex,
  getSearchIndexRun: dbSearchIndexingMocks.getSearchIndexRun,
  getSearchIndexRunByShadowHint: dbSearchIndexingMocks.getSearchIndexRunByShadowHint,
  markSearchIndexRunFailed: dbSearchIndexingMocks.markSearchIndexRunFailed,
  markSearchIndexRunSucceeded: dbSearchIndexingMocks.markSearchIndexRunSucceeded,
  updateSearchIndexRun: dbSearchIndexingMocks.updateSearchIndexRun,
}));

vi.mock("./queries", () => ({
  formatMessageBucket: queryMocks.formatMessageBucket,
  getUserHistoryForBatch: queryMocks.getUserHistoryForBatch,
  listAllChats: queryMocks.listAllChats,
  listAllMessages: queryMocks.listAllMessages,
  listAllUsers: queryMocks.listAllUsers,
  listUsersByIds: queryMocks.listUsersByIds,
  streamAllMessages: queryMocks.streamAllMessages,
  streamAllMessagesFromChatTable: queryMocks.streamAllMessagesFromChatTable,
  streamAllMessagesFromChats: queryMocks.streamAllMessagesFromChats,
  streamAllMessagesFromUserTable: queryMocks.streamAllMessagesFromUserTable,
  streamAllMessagesFromUsers: queryMocks.streamAllMessagesFromUsers,
}));

const {
  buildMessageDocumentsFromMaps,
  legacySyncSearchDocuments,
  reindexSearchDocuments,
  resumeSearchReindex,
} =
  await import("./searchIndexer");

function pages<T>(...items: T[][]): AsyncGenerator<T[]> {
  return (async function* () {
    for (const item of items) {
      yield item;
    }
  })();
}

const users = [
  {
    user_id: "u1",
    username: "alice",
    display_name: "Alice",
  },
];

const chats = [
  {
    chat_id: "c1",
    username: "general",
    display_name: "General",
    chat_type: "group",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SEARCH_INDEX_SYNC_PHASES;
  delete process.env.SEARCH_INDEX_REINDEX_PHASES;
  delete process.env.SEARCH_INDEX_BATCH_SIZE;
  delete process.env.SEARCH_INDEX_UPLOAD_CONCURRENCY;
  delete process.env.SEARCH_INDEX_CASSANDRA_PAGE_SIZE;
  delete process.env.SEARCH_INDEX_FLUSH_MULTIPLIER;
  delete process.env.SEARCH_INDEX_CHAT_SCAN_CONCURRENCY;
  delete process.env.SEARCH_INDEX_USER_SCAN_CONCURRENCY;
  delete process.env.SEARCH_INDEX_MESSAGE_SCAN_MODE;
  delete process.env.SEARCH_INDEX_BUCKET_START_YEAR;
  delete process.env.SEARCH_INDEX_BUCKET_START_MONTH;
  delete process.env.SEARCH_INDEX_AUTO_PRUNE_SHADOW_INDEXES;

  searchIndexMocks.configureSearchIndices.mockResolvedValue(undefined);
  searchIndexMocks.deleteAllDocuments.mockResolvedValue({ taskUid: 1, batchUid: 1 });
  searchIndexMocks.deleteIndex.mockResolvedValue({ taskUid: 6, batchUid: 6 });
  searchIndexMocks.getBatch.mockResolvedValue({ uid: 1, progressTrace: {} });
  searchIndexMocks.getIndexStats.mockImplementation(async (uid: string) => {
    if (uid.includes("profiles")) return { numberOfDocuments: 1 };
    if (uid.includes("chats")) return { numberOfDocuments: 1 };
    return { numberOfDocuments: 1 };
  });
  searchIndexMocks.replaceDocuments.mockResolvedValue({ taskUid: 2, batchUid: 2 });
  searchIndexMocks.swapIndexes.mockResolvedValue({ taskUid: 4, batchUid: 4 });
  searchIndexMocks.updateDocuments.mockResolvedValue({ taskUid: 3, batchUid: 3 });
  searchIndexMocks.waitForTask.mockImplementation(async (taskUid: number) => ({
    taskUid,
    batchUid: taskUid,
  }));

  dbSearchIndexingMocks.createSearchIndexRun.mockResolvedValue({ id: "run-1234" });
  dbSearchIndexingMocks.getLatestResumableFullReindex.mockResolvedValue(null);
  dbSearchIndexingMocks.getSearchIndexRun.mockResolvedValue(null);
  dbSearchIndexingMocks.getSearchIndexRunByShadowHint.mockResolvedValue(null);
  dbSearchIndexingMocks.markSearchIndexRunFailed.mockResolvedValue(undefined);
  dbSearchIndexingMocks.markSearchIndexRunSucceeded.mockResolvedValue(undefined);
  dbSearchIndexingMocks.updateSearchIndexRun.mockResolvedValue(undefined);

  queryMocks.listAllUsers.mockResolvedValue(users);
  queryMocks.listAllChats.mockResolvedValue(chats);
  queryMocks.listAllMessages.mockResolvedValue([]);
  queryMocks.listUsersByIds.mockImplementation(async (ids: string[]) =>
    users.filter((user) => ids.includes(user.user_id))
  );
  queryMocks.getUserHistoryForBatch.mockResolvedValue(new Map());

  queryMocks.streamAllMessagesFromChatTable.mockReturnValue(
    pages([
      {
        chat_id: "c1",
        message_id: "m1",
        user_id: "u1",
        content: "hello from chat",
      },
    ])
  );
  queryMocks.streamAllMessagesFromUserTable.mockReturnValue(
    pages([
      {
        chat_id: "c1",
        message_id: "m2",
        user_id: "u1",
        content: "hello from user partition",
      },
    ])
  );
  queryMocks.streamAllMessagesFromChats.mockReturnValue(
    pages([
      {
        chat_id: "c1",
        message_id: "m1",
        user_id: "u1",
        content: "hello from chat",
      },
    ])
  );
  queryMocks.streamAllMessagesFromUsers.mockReturnValue(
    pages([
      {
        chat_id: "c1",
        message_id: "m2",
        user_id: "u1",
        content: "hello from user partition",
      },
    ])
  );
  queryMocks.streamAllMessages.mockReturnValue(
    pages([
      {
        chat_id: "c1",
        message_id: "m3",
        user_id: "u1",
        content: "hello from id table",
      },
    ])
  );
});

describe("searchIndexer behavior", () => {
  it("keeps legacy sync comprehensive by default with partition scans across chat and user partitions", async () => {
    const result = await legacySyncSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChatTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromUserTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledWith(
      ["c1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 12, bucketStartYear: 2013, bucketStartMonth: 1 })
    );
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledWith(
      ["u1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 12, bucketStartYear: 2013, bucketStartMonth: 1 })
    );
    expect(searchIndexMocks.updateDocuments).toHaveBeenCalled();
    expect(result.messages).toBe(3);
  });

  it("restores required phases even when env tries to narrow legacy sync coverage", async () => {
    process.env.SEARCH_INDEX_SYNC_PHASES = "messages_by_chat,messages_by_id";

    const result = await legacySyncSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChatTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromUserTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(result.messages).toBe(3);
  });

  it("rebuilds shadow indexes from chat-backed message scans and swaps atomically", async () => {
    const result = await reindexSearchDocuments();

    expect(queryMocks.streamAllMessagesFromChatTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUserTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessages).not.toHaveBeenCalled();
    expect(searchIndexMocks.configureSearchIndices).toHaveBeenCalledWith({
      profiles: expect.stringContaining("profiles__shadow_"),
      chats: expect.stringContaining("chats__shadow_"),
      messages: expect.stringContaining("messages__shadow_"),
    });
    expect(searchIndexMocks.swapIndexes).toHaveBeenCalledTimes(2);
    expect(searchIndexMocks.swapIndexes.mock.calls[0]?.[0]).toEqual([
      {
        indexes: ["messages", expect.stringContaining("messages__shadow_")],
      },
    ]);
    expect(dbSearchIndexingMocks.markSearchIndexRunSucceeded).toHaveBeenCalledTimes(1);
    expect(result.messages).toBe(1);
  });

  it("falls back to full table scan when partition scanning finds no chat messages", async () => {
    queryMocks.streamAllMessagesFromChats.mockReturnValueOnce(pages([]));

    const result = await reindexSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromChatTable).toHaveBeenCalledTimes(1);
    expect(result.messages).toBe(1);
  });

  it("can rebuild only the messages index without re-uploading profiles or chats", async () => {
    const result = await reindexSearchDocuments(["messages"]);

    expect(queryMocks.listAllUsers).not.toHaveBeenCalled();
    expect(queryMocks.getUserHistoryForBatch).not.toHaveBeenCalled();
    expect(queryMocks.listUsersByIds).toHaveBeenCalledWith(["u1"]);
    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.replaceDocuments).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.replaceDocuments.mock.calls[0]?.[0]).toContain("messages__shadow_");
    expect(searchIndexMocks.swapIndexes).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.swapIndexes).toHaveBeenCalledWith([
      {
        indexes: [
          "messages",
          expect.stringContaining("messages__shadow_"),
        ],
      },
    ]);
    expect(result.profiles).toBe(0);
    expect(result.chats).toBe(0);
    expect(result.messages).toBe(1);
  });

  it("does not require global in-memory dedupe when the same message appears in multiple reindex phases", async () => {
    process.env.SEARCH_INDEX_REINDEX_PHASES = "messages_by_chat,messages_by_user";
    queryMocks.streamAllMessagesFromChats.mockReturnValueOnce(
      pages([
        {
          chat_id: "c1",
          message_id: "m1",
          user_id: "u1",
          content: "hello from chat",
        },
      ])
    );
    queryMocks.streamAllMessagesFromUsers.mockReturnValueOnce(
      pages([
        {
          chat_id: "c1",
          message_id: "m1",
          user_id: "u1",
          content: "hello from user partition",
        },
      ])
    );

    const result = await reindexSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.replaceDocuments).toHaveBeenCalledTimes(2);
    expect(result.messages).toBe(1);
  });

  it("can disable early message swapping when requested", async () => {
    process.env.SEARCH_INDEX_EARLY_MESSAGE_SWAP = "false";

    await reindexSearchDocuments();

    expect(searchIndexMocks.swapIndexes).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.swapIndexes).toHaveBeenCalledWith([
      {
        indexes: ["profiles", expect.stringContaining("profiles__shadow_")],
      },
      {
        indexes: ["chats", expect.stringContaining("chats__shadow_")],
      },
      {
        indexes: ["messages", expect.stringContaining("messages__shadow_")],
      },
    ]);
  });

  it("can tune partition scan concurrency for legacy sync", async () => {
    process.env.SEARCH_INDEX_CHAT_SCAN_CONCURRENCY = "6";
    process.env.SEARCH_INDEX_USER_SCAN_CONCURRENCY = "3";
    process.env.SEARCH_INDEX_MESSAGE_SCAN_MODE = "partition_scan";
    process.env.SEARCH_INDEX_BUCKET_START_YEAR = "2015";
    process.env.SEARCH_INDEX_BUCKET_START_MONTH = "4";

    await legacySyncSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChatTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromUserTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledWith(
      ["c1"],
      expect.objectContaining({
        fetchSize: 10000,
        concurrency: 6,
        bucketStartYear: 2015,
        bucketStartMonth: 4,
      })
    );
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledWith(
      ["u1"],
      expect.objectContaining({
        fetchSize: 10000,
        concurrency: 3,
        bucketStartYear: 2015,
        bucketStartMonth: 4,
      })
    );
  });

  it("resumes the latest full reindex into the existing shadow indexes without clearing messages", async () => {
    dbSearchIndexingMocks.getLatestResumableFullReindex.mockResolvedValue({
      id: "run-resume",
      mode: "full_reindex",
      scopes: ["profiles", "chats", "messages"],
      progress_summary: {},
      metadata: {
        shadowIndexes: {
          profiles: "profiles__shadow_resume",
          chats: "chats__shadow_resume",
          messages: "messages__shadow_resume",
        },
      },
    });

    const result = await resumeSearchReindex();

    expect(dbSearchIndexingMocks.createSearchIndexRun).not.toHaveBeenCalled();
    expect(searchIndexMocks.configureSearchIndices).toHaveBeenCalledWith({
      profiles: "profiles__shadow_resume",
      chats: "chats__shadow_resume",
      messages: "messages__shadow_resume",
    });
    expect(searchIndexMocks.deleteAllDocuments).toHaveBeenCalledTimes(2);
    expect(searchIndexMocks.updateDocuments).toHaveBeenCalled();
    expect(result.runId).toBe("run-resume");
  });

  it("reuses the latest resumable full reindex by default instead of creating a second shadow run", async () => {
    const existingRun = {
      id: "11111111-1111-1111-1111-111111111111",
      mode: "full_reindex",
      scopes: ["profiles", "chats", "messages"],
      progress_summary: {},
      metadata: {
        shadowIndexes: {
          profiles: "profiles__shadow_existing",
          chats: "chats__shadow_existing",
          messages: "messages__shadow_existing",
        },
      },
    };
    dbSearchIndexingMocks.getLatestResumableFullReindex.mockResolvedValue(existingRun);
    dbSearchIndexingMocks.getSearchIndexRun.mockResolvedValue(existingRun);

    const result = await reindexSearchDocuments();

    expect(dbSearchIndexingMocks.createSearchIndexRun).not.toHaveBeenCalled();
    expect(searchIndexMocks.configureSearchIndices).toHaveBeenCalledWith({
      profiles: "profiles__shadow_existing",
      chats: "chats__shadow_existing",
      messages: "messages__shadow_existing",
    });
    expect(result.runId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("can resume a specific run id and skips message reindexing when messages are already live", async () => {
    dbSearchIndexingMocks.getSearchIndexRun.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      mode: "full_reindex",
      scopes: ["profiles", "chats", "messages"],
      progress_summary: {
        messageSwapEarly: true,
        messagesVisible: true,
      },
      metadata: {
        shadowIndexes: {
          profiles: "profiles__shadow_live",
          chats: "chats__shadow_live",
          messages: "messages__shadow_live",
        },
      },
    });

    const result = await resumeSearchReindex("22222222-2222-2222-2222-222222222222");

    expect(queryMocks.streamAllMessagesFromChats).not.toHaveBeenCalled();
    expect(searchIndexMocks.updateDocuments).not.toHaveBeenCalled();
    expect(searchIndexMocks.swapIndexes).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.swapIndexes).toHaveBeenCalledWith([
      {
        indexes: ["profiles", "profiles__shadow_live"],
      },
      {
        indexes: ["chats", "chats__shadow_live"],
      },
    ]);
    expect(result.messages).toBe(0);
  });

  it("can resume from a shadow suffix when the caller does not know the full run uuid", async () => {
    dbSearchIndexingMocks.getSearchIndexRun.mockResolvedValue(null);
    dbSearchIndexingMocks.getSearchIndexRunByShadowHint.mockResolvedValue({
      id: "33333333-3333-3333-3333-333333333333",
      mode: "full_reindex",
      scopes: ["profiles", "chats", "messages"],
      progress_summary: {},
      metadata: {
        shadowIndexes: {
          profiles: "profiles__shadow_c2ca531f667c412e",
          chats: "chats__shadow_c2ca531f667c412e",
          messages: "messages__shadow_c2ca531f667c412e",
        },
      },
    });

    const result = await resumeSearchReindex("c2ca531f667c412e");

    expect(dbSearchIndexingMocks.getSearchIndexRun).not.toHaveBeenCalled();
    expect(dbSearchIndexingMocks.getSearchIndexRunByShadowHint).toHaveBeenCalledWith("c2ca531f667c412e");
    expect(searchIndexMocks.configureSearchIndices).toHaveBeenCalledWith({
      profiles: "profiles__shadow_c2ca531f667c412e",
      chats: "chats__shadow_c2ca531f667c412e",
      messages: "messages__shadow_c2ca531f667c412e",
    });
    expect(result.runId).toBe("33333333-3333-3333-3333-333333333333");
  });

  it("can reconstruct shadow indexes from the run uuid when metadata is missing during explicit resume", async () => {
    dbSearchIndexingMocks.getSearchIndexRun.mockResolvedValue({
      id: "dc793b87-4cda-4301-9b0f-123456789abc",
      mode: "full_reindex",
      scopes: ["profiles", "chats", "messages"],
      progress_summary: {},
      metadata: {},
    });

    const result = await resumeSearchReindex("dc793b87-4cda-4301-9b0f-123456789abc");

    expect(searchIndexMocks.configureSearchIndices).toHaveBeenCalledWith({
      profiles: "profiles__shadow_dc793b874cda4301",
      chats: "chats__shadow_dc793b874cda4301",
      messages: "messages__shadow_dc793b874cda4301",
    });
    expect(result.runId).toBe("dc793b87-4cda-4301-9b0f-123456789abc");
  });
});

describe("message document enrichment", () => {
  it("stores per-message bucket metadata and character sets for later lookup recovery", () => {
    const documents = buildMessageDocumentsFromMaps(
      [
        {
          chat_id: "c1",
          message_id: "m42",
          user_id: "u1",
          content: "hello",
          timestamp: new Date("2024-03-10T12:00:00.000Z"),
        },
      ],
      new Map(users.map((user) => [user.user_id, user])),
      new Map(chats.map((chat) => [chat.chat_id, chat]))
    );

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      documentId: "c1_m42",
      bucket: "202403",
      senderUsername: "alice",
      chatTitle: "General",
      content: "hello",
      contentCharacterSet: expect.arrayContaining(["h", "e", "l", "o"]),
    });
  });
});
