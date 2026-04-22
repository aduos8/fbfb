import { beforeEach, describe, expect, it, vi } from "vitest";

const searchIndexMocks = vi.hoisted(() => ({
  configureSearchIndices: vi.fn(),
  deleteAllDocuments: vi.fn(),
  replaceDocuments: vi.fn(),
  updateDocuments: vi.fn(),
  waitForTask: vi.fn(),
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
  configureSearchIndices: searchIndexMocks.configureSearchIndices,
  deleteAllDocuments: searchIndexMocks.deleteAllDocuments,
  replaceDocuments: searchIndexMocks.replaceDocuments,
  updateDocuments: searchIndexMocks.updateDocuments,
  waitForTask: searchIndexMocks.waitForTask,
}));

vi.mock("./queries", () => ({
  formatMessageBucket: queryMocks.formatMessageBucket,
  getUserHistoryForBatch: queryMocks.getUserHistoryForBatch,
  listAllChats: queryMocks.listAllChats,
  listAllMessages: queryMocks.listAllMessages,
  listAllUsers: queryMocks.listAllUsers,
  streamAllMessages: queryMocks.streamAllMessages,
  streamAllMessagesFromChatTable: queryMocks.streamAllMessagesFromChatTable,
  streamAllMessagesFromChats: queryMocks.streamAllMessagesFromChats,
  streamAllMessagesFromUserTable: queryMocks.streamAllMessagesFromUserTable,
  streamAllMessagesFromUsers: queryMocks.streamAllMessagesFromUsers,
}));

const { buildMessageDocumentsFromMaps, reindexSearchDocuments, syncSearchDocuments } = await import("./searchIndexer");

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

  searchIndexMocks.configureSearchIndices.mockResolvedValue(undefined);
  searchIndexMocks.deleteAllDocuments.mockResolvedValue({ taskUid: 1 });
  searchIndexMocks.replaceDocuments.mockResolvedValue({ taskUid: 2 });
  searchIndexMocks.updateDocuments.mockResolvedValue({ taskUid: 3 });
  searchIndexMocks.waitForTask.mockResolvedValue(undefined);

  queryMocks.listAllUsers.mockResolvedValue(users);
  queryMocks.listAllChats.mockResolvedValue(chats);
  queryMocks.listAllMessages.mockResolvedValue([]);
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

describe("searchIndexer phase selection", () => {
  it("keeps sync comprehensive by default with full table scans", async () => {
    const result = await syncSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChatTable).toHaveBeenCalledWith(10000);
    expect(queryMocks.streamAllMessagesFromUserTable).toHaveBeenCalledWith(10000);
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromChats).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromUsers).not.toHaveBeenCalled();
    expect(searchIndexMocks.updateDocuments).toHaveBeenCalled();
    expect(result.messages).toBe(3);
  });

  it("restores required phases even when env tries to narrow sync coverage", async () => {
    process.env.SEARCH_INDEX_SYNC_PHASES = "messages_by_chat,messages_by_id";

    const result = await syncSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChatTable).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUserTable).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(result.messages).toBe(3);
  });

  it("keeps full reindex comprehensive by default", async () => {
    const result = await reindexSearchDocuments();

    expect(queryMocks.streamAllMessagesFromChatTable).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUserTable).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.replaceDocuments).toHaveBeenCalled();
    expect(result.messages).toBe(3);
  });

  it("can still use partition scans when explicitly requested", async () => {
    process.env.SEARCH_INDEX_CHAT_SCAN_CONCURRENCY = "6";
    process.env.SEARCH_INDEX_USER_SCAN_CONCURRENCY = "3";
    process.env.SEARCH_INDEX_MESSAGE_SCAN_MODE = "partition_scan";
    process.env.SEARCH_INDEX_BUCKET_START_YEAR = "2015";
    process.env.SEARCH_INDEX_BUCKET_START_MONTH = "4";

    await reindexSearchDocuments();

    expect(queryMocks.streamAllMessagesFromChatTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromUserTable).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledWith(
      ["c1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 6, bucketStartYear: 2015, bucketStartMonth: 4 })
    );
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledWith(
      ["u1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 3, bucketStartYear: 2015, bucketStartMonth: 4 })
    );
  });
});

describe("message document enrichment", () => {
  it("stores per-message bucket metadata for later lookup recovery", () => {
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
    });
  });
});
