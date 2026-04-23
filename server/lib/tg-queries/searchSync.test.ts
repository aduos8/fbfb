import { beforeEach, describe, expect, it, vi } from "vitest";

const dbSearchIndexingMocks = vi.hoisted(() => ({
  claimSearchIndexEvents: vi.fn(),
  createSearchIndexRun: vi.fn(),
  enqueueSearchIndexEvents: vi.fn(),
  markSearchIndexEventsProcessed: vi.fn(),
  markSearchIndexRunFailed: vi.fn(),
  markSearchIndexRunSucceeded: vi.fn(),
  retrySearchIndexEvent: vi.fn(),
}));

const searchIndexMocks = vi.hoisted(() => ({
  deleteDocuments: vi.fn(),
  getBatch: vi.fn(),
  updateDocuments: vi.fn(),
  waitForTask: vi.fn(),
}));

const searchIndexerMocks = vi.hoisted(() => ({
  buildChatDocuments: vi.fn((chats: any[]) => chats.map((chat) => ({ chatId: chat.chat_id }))),
  buildMessageDocumentsFromMaps: vi.fn((messages: any[]) =>
    messages.map((message) => ({
      documentId: `${message.chat_id}_${message.message_id}`,
      messageId: message.message_id,
      chatId: message.chat_id,
      content: message.content,
      contentCharacterSet: Array.from(new Set(String(message.content ?? "").toLowerCase().split(""))),
      contentLength: String(message.content ?? "").length,
      containsLinks: false,
      bucket: message.bucket ?? "202403",
      timestamp: "2024-03-10T12:00:00.000Z",
      timestampMs: 1710072000000,
    }))
  ),
  buildProfileDocuments: vi.fn((users: any[]) => users.map((user) => ({ userId: user.user_id }))),
  legacySyncSearchDocuments: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  getChatById: vi.fn(),
  getMessageByChatBucketTimestamp: vi.fn(),
  getMessageById: vi.fn(),
  getUserById: vi.fn(),
  getUserHistoryForBatch: vi.fn(),
  listChatsByIds: vi.fn(),
  listUsersByIds: vi.fn(),
  streamAllMessagesFromChats: vi.fn(),
  streamAllMessagesFromUsers: vi.fn(),
}));

vi.mock("../db/searchIndexing", () => ({
  claimSearchIndexEvents: dbSearchIndexingMocks.claimSearchIndexEvents,
  createSearchIndexRun: dbSearchIndexingMocks.createSearchIndexRun,
  enqueueSearchIndexEvents: dbSearchIndexingMocks.enqueueSearchIndexEvents,
  markSearchIndexEventsProcessed: dbSearchIndexingMocks.markSearchIndexEventsProcessed,
  markSearchIndexRunFailed: dbSearchIndexingMocks.markSearchIndexRunFailed,
  markSearchIndexRunSucceeded: dbSearchIndexingMocks.markSearchIndexRunSucceeded,
  retrySearchIndexEvent: dbSearchIndexingMocks.retrySearchIndexEvent,
}));

vi.mock("./searchIndex", () => ({
  SEARCH_INDEXES: {
    profiles: "profiles",
    chats: "chats",
    messages: "messages",
  },
  getSearchBackend: () => "meilisearch",
  isTrackedSearchTaskId: (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value > 0,
  deleteDocuments: searchIndexMocks.deleteDocuments,
  getBatch: searchIndexMocks.getBatch,
  updateDocuments: searchIndexMocks.updateDocuments,
  waitForTask: searchIndexMocks.waitForTask,
}));

vi.mock("./searchIndexer", () => ({
  buildChatDocuments: searchIndexerMocks.buildChatDocuments,
  buildMessageDocumentsFromMaps: searchIndexerMocks.buildMessageDocumentsFromMaps,
  buildProfileDocuments: searchIndexerMocks.buildProfileDocuments,
  legacySyncSearchDocuments: searchIndexerMocks.legacySyncSearchDocuments,
}));

vi.mock("./queries", () => ({
  getChatById: queryMocks.getChatById,
  getMessageByChatBucketTimestamp: queryMocks.getMessageByChatBucketTimestamp,
  getMessageById: queryMocks.getMessageById,
  getUserById: queryMocks.getUserById,
  getUserHistoryForBatch: queryMocks.getUserHistoryForBatch,
  listChatsByIds: queryMocks.listChatsByIds,
  listUsersByIds: queryMocks.listUsersByIds,
  streamAllMessagesFromChats: queryMocks.streamAllMessagesFromChats,
  streamAllMessagesFromUsers: queryMocks.streamAllMessagesFromUsers,
}));

const { consumeSearchIndexOutbox } = await import("./searchSync");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SEARCH_INDEX_SYNC_USE_LEGACY_RESCAN;

  dbSearchIndexingMocks.createSearchIndexRun.mockResolvedValue({ id: "sync-run-1" });
  dbSearchIndexingMocks.enqueueSearchIndexEvents.mockResolvedValue([]);
  dbSearchIndexingMocks.markSearchIndexEventsProcessed.mockResolvedValue(undefined);
  dbSearchIndexingMocks.markSearchIndexRunFailed.mockResolvedValue(undefined);
  dbSearchIndexingMocks.markSearchIndexRunSucceeded.mockResolvedValue(undefined);
  dbSearchIndexingMocks.retrySearchIndexEvent.mockResolvedValue(undefined);

  searchIndexMocks.deleteDocuments.mockResolvedValue({ taskUid: 10, batchUid: 10 });
  searchIndexMocks.getBatch.mockResolvedValue({ uid: 10, progressTrace: {} });
  searchIndexMocks.updateDocuments.mockResolvedValue({ taskUid: 11, batchUid: 11 });
  searchIndexMocks.waitForTask.mockImplementation(async (taskUid: number) => ({ taskUid, batchUid: taskUid }));

  queryMocks.getChatById.mockResolvedValue({ chat_id: "c1", display_name: "General", chat_type: "group" });
  queryMocks.getMessageByChatBucketTimestamp.mockResolvedValue(null);
  queryMocks.getMessageById.mockResolvedValue({
    chat_id: "c1",
    message_id: "m1",
    user_id: "u1",
    content: "indexed content",
    bucket: "202403",
  });
  queryMocks.getUserById.mockResolvedValue({ user_id: "u1", username: "alice" });
  queryMocks.getUserHistoryForBatch.mockResolvedValue(new Map());
  queryMocks.listChatsByIds.mockResolvedValue([{ chat_id: "c1", display_name: "General", chat_type: "group" }]);
  queryMocks.listUsersByIds.mockResolvedValue([{ user_id: "u1", username: "alice" }]);
  queryMocks.streamAllMessagesFromChats.mockReturnValue((async function* () {})());
  queryMocks.streamAllMessagesFromUsers.mockReturnValue((async function* () {})());
});

describe("consumeSearchIndexOutbox", () => {
  it("indexes message upserts with searchable content", async () => {
    dbSearchIndexingMocks.claimSearchIndexEvents
      .mockResolvedValueOnce([
        {
          id: 1,
          event_type: "message_upsert",
          scope: "messages",
          entity_key: "message:c1:m1",
          source_ref: { chatId: "c1", messageId: "m1", bucket: "202403", timestamp: "2024-03-10T12:00:00.000Z" },
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await consumeSearchIndexOutbox(["messages"]);

    expect(searchIndexerMocks.buildMessageDocumentsFromMaps).toHaveBeenCalledTimes(1);
    expect(searchIndexMocks.updateDocuments).toHaveBeenCalledWith(
      "messages",
      [
        expect.objectContaining({
          documentId: "c1_m1",
          content: "indexed content",
          contentLength: "indexed content".length,
        }),
      ],
      expect.objectContaining({ customMetadata: expect.stringContaining("message-upsert") })
    );
    expect(result.messages).toBe(1);
    expect(result.processedEvents).toBe(1);
  });

  it("deletes message documents by deterministic document id", async () => {
    dbSearchIndexingMocks.claimSearchIndexEvents
      .mockResolvedValueOnce([
        {
          id: 2,
          event_type: "message_delete",
          scope: "messages",
          entity_key: "message:c1:m1",
          source_ref: { chatId: "c1", messageId: "m1", bucket: "202403", timestamp: "2024-03-10T12:00:00.000Z" },
        },
      ])
      .mockResolvedValueOnce([]);

    await consumeSearchIndexOutbox(["messages"]);

    expect(searchIndexMocks.deleteDocuments).toHaveBeenCalledWith(
      "messages",
      ["c1_m1"],
      expect.objectContaining({ customMetadata: expect.stringContaining("message-delete") })
    );
  });

  it("enqueues targeted message refresh work after profile upserts", async () => {
    dbSearchIndexingMocks.claimSearchIndexEvents
      .mockResolvedValueOnce([
        {
          id: 3,
          event_type: "profile_upsert",
          scope: "profiles",
          entity_key: "profile:u1",
          source_ref: { userId: "u1" },
        },
      ])
      .mockResolvedValueOnce([]);

    await consumeSearchIndexOutbox(["profiles", "messages"]);

    expect(searchIndexerMocks.buildProfileDocuments).toHaveBeenCalledTimes(1);
    expect(dbSearchIndexingMocks.enqueueSearchIndexEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: "profile_messages_refresh",
        scope: "messages",
        sourceRef: { userId: "u1" },
      }),
    ]);
  });
});
