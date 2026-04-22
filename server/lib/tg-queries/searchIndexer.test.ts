import { beforeEach, describe, expect, it, vi } from "vitest";

const searchIndexMocks = vi.hoisted(() => ({
  configureSearchIndices: vi.fn(),
  deleteAllDocuments: vi.fn(),
  replaceDocuments: vi.fn(),
  updateDocuments: vi.fn(),
  waitForTask: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  getUserHistoryForBatch: vi.fn(),
  listAllChats: vi.fn(),
  listAllMessages: vi.fn(),
  listAllUsers: vi.fn(),
  streamAllMessages: vi.fn(),
  streamAllMessagesFromChats: vi.fn(),
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
  getUserHistoryForBatch: queryMocks.getUserHistoryForBatch,
  listAllChats: queryMocks.listAllChats,
  listAllMessages: queryMocks.listAllMessages,
  listAllUsers: queryMocks.listAllUsers,
  streamAllMessages: queryMocks.streamAllMessages,
  streamAllMessagesFromChats: queryMocks.streamAllMessagesFromChats,
  streamAllMessagesFromUsers: queryMocks.streamAllMessagesFromUsers,
}));

const { reindexSearchDocuments, syncSearchDocuments } = await import("./searchIndexer");

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

  searchIndexMocks.configureSearchIndices.mockResolvedValue(undefined);
  searchIndexMocks.deleteAllDocuments.mockResolvedValue({ taskUid: 1 });
  searchIndexMocks.replaceDocuments.mockResolvedValue({ taskUid: 2 });
  searchIndexMocks.updateDocuments.mockResolvedValue({ taskUid: 3 });
  searchIndexMocks.waitForTask.mockResolvedValue(undefined);

  queryMocks.listAllUsers.mockResolvedValue(users);
  queryMocks.listAllChats.mockResolvedValue(chats);
  queryMocks.listAllMessages.mockResolvedValue([]);
  queryMocks.getUserHistoryForBatch.mockResolvedValue(new Map());

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
  it("keeps sync comprehensive by default", async () => {
    const result = await syncSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledWith(
      ["c1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 4 })
    );
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledWith(
      ["u1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 4 })
    );
    expect(searchIndexMocks.updateDocuments).toHaveBeenCalled();
    expect(result.messages).toBe(3);
  });

  it("still allows opting into a narrower sync phase set via env", async () => {
    process.env.SEARCH_INDEX_SYNC_PHASES = "messages_by_chat,messages_by_id";

    const result = await syncSearchDocuments(["messages"]);

    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUsers).not.toHaveBeenCalled();
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(result.messages).toBe(2);
  });

  it("keeps full reindex comprehensive by default", async () => {
    const result = await reindexSearchDocuments();

    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledTimes(1);
    expect(queryMocks.streamAllMessages).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.replaceDocuments).toHaveBeenCalled();
    expect(result.messages).toBe(3);
  });

  it("passes scan concurrency overrides through to the partitioned streams", async () => {
    process.env.SEARCH_INDEX_CHAT_SCAN_CONCURRENCY = "6";
    process.env.SEARCH_INDEX_USER_SCAN_CONCURRENCY = "3";

    await reindexSearchDocuments();

    expect(queryMocks.streamAllMessagesFromChats).toHaveBeenCalledWith(
      ["c1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 6 })
    );
    expect(queryMocks.streamAllMessagesFromUsers).toHaveBeenCalledWith(
      ["u1"],
      expect.objectContaining({ fetchSize: 10000, concurrency: 3 })
    );
  });
});
