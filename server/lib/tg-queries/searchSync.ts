import {
  claimSearchIndexEvents,
  createSearchIndexRun,
  enqueueSearchIndexEvents,
  markSearchIndexEventsProcessed,
  markSearchIndexRunFailed,
  markSearchIndexRunSucceeded,
  retrySearchIndexEvent,
  type EnqueueSearchIndexEventInput,
  type SearchIndexOutboxRecord,
  type SearchIndexScope,
} from "../db/searchIndexing";
import {
  deleteDocuments,
  getBatch,
  getSearchBackend,
  isTrackedSearchTaskId,
  updateDocuments,
  waitForTask,
  SEARCH_INDEXES,
  type MeilisearchBatch,
  type MeilisearchTask,
} from "./searchIndex";
import {
  buildChatDocuments,
  buildMessageDocumentsFromMaps,
  buildProfileDocuments,
  legacySyncSearchDocuments,
} from "./searchIndexer";
import {
  getChatById,
  getMessageByChatBucketTimestamp,
  getMessageById,
  getUserById,
  getUserHistoryForBatch,
  listChatsByIds,
  listUsersByIds,
  streamAllMessagesFromChats,
  streamAllMessagesFromUsers,
  type ChatRecord,
  type MessageRecord,
  type UserRecord,
} from "./queries";

const DEFAULT_OUTBOX_BATCH_SIZE = 50;
const DEFAULT_RETRY_DELAY_SECONDS = 30;
const DEFAULT_CASSANDRA_PAGE_SIZE = 10000;
const DEFAULT_BUCKET_START_YEAR = 2013;
const DEFAULT_BUCKET_START_MONTH = 1;

type SyncProcessingStats = {
  processedEvents: number;
  profiles: number;
  chats: number;
  messages: number;
  taskUids: number[];
  batchUids: number[];
};

type SourceRef = Record<string, unknown>;

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function getSyncConfig() {
  return {
    outboxBatchSize: readPositiveIntEnv("SEARCH_INDEX_OUTBOX_BATCH_SIZE", DEFAULT_OUTBOX_BATCH_SIZE),
    retryDelaySeconds: readPositiveIntEnv("SEARCH_INDEX_OUTBOX_RETRY_DELAY_SECONDS", DEFAULT_RETRY_DELAY_SECONDS),
    cassandraPageSize: readPositiveIntEnv("SEARCH_INDEX_CASSANDRA_PAGE_SIZE", DEFAULT_CASSANDRA_PAGE_SIZE),
    bucketStartYear: readPositiveIntEnv("SEARCH_INDEX_BUCKET_START_YEAR", DEFAULT_BUCKET_START_YEAR),
    bucketStartMonth: Math.min(12, Math.max(1, readPositiveIntEnv("SEARCH_INDEX_BUCKET_START_MONTH", DEFAULT_BUCKET_START_MONTH))),
  };
}

export function isLegacySearchSyncEnabled() {
  return readBooleanEnv("SEARCH_INDEX_SYNC_USE_LEGACY_RESCAN", false);
}

function createInitialStats(): SyncProcessingStats {
  return {
    processedEvents: 0,
    profiles: 0,
    chats: 0,
    messages: 0,
    taskUids: [],
    batchUids: [],
  };
}

function addTask(stats: SyncProcessingStats, task: MeilisearchTask) {
  if (isTrackedSearchTaskId(task.taskUid)) {
    stats.taskUids.push(task.taskUid);
  }
  if (isTrackedSearchTaskId(task.batchUid)) {
    stats.batchUids.push(task.batchUid);
  }
}

async function buildBatchProgressSummary(batchUids: number[]) {
  const uniqueBatchUids = Array.from(new Set(batchUids));
  const batches: Array<MeilisearchBatch & { uid: number }> = [];

  for (const batchUid of uniqueBatchUids) {
    try {
      const batch = await getBatch(batchUid);
      batches.push({ uid: batchUid, ...batch });
    } catch (error) {
      batches.push({
        uid: batchUid,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return {
    batchCount: uniqueBatchUids.length,
    batches: batches.map((batch) => ({
      uid: batch.uid,
      duration: batch.duration ?? null,
      startedAt: batch.startedAt ?? null,
      finishedAt: batch.finishedAt ?? null,
      details: batch.details ?? {},
      progressTrace: batch.progressTrace ?? {},
    })),
  };
}

class SearchSyncContext {
  private readonly userCache = new Map<string, UserRecord | null>();
  private readonly chatCache = new Map<string, ChatRecord | null>();

  async getUser(userId: string) {
    if (!this.userCache.has(userId)) {
      this.userCache.set(userId, await getUserById(userId));
    }
    return this.userCache.get(userId) ?? null;
  }

  async getChat(chatId: string) {
    if (!this.chatCache.has(chatId)) {
      this.chatCache.set(chatId, await getChatById(chatId));
    }
    return this.chatCache.get(chatId) ?? null;
  }

  async hydrateUsers(userIds: string[]) {
    const missingIds = Array.from(new Set(userIds.filter(Boolean))).filter((userId) => !this.userCache.has(userId));
    if (missingIds.length === 0) {
      return;
    }

    const users = await listUsersByIds(missingIds);
    for (const user of users) {
      this.userCache.set(user.user_id, user);
    }
    for (const userId of missingIds) {
      if (!this.userCache.has(userId)) {
        this.userCache.set(userId, null);
      }
    }
  }

  async hydrateChats(chatIds: string[]) {
    const missingIds = Array.from(new Set(chatIds.filter(Boolean))).filter((chatId) => !this.chatCache.has(chatId));
    if (missingIds.length === 0) {
      return;
    }

    const chats = await listChatsByIds(missingIds);
    for (const chat of chats) {
      this.chatCache.set(chat.chat_id, chat);
    }
    for (const chatId of missingIds) {
      if (!this.chatCache.has(chatId)) {
        this.chatCache.set(chatId, null);
      }
    }
  }

  userMap() {
    return new Map(Array.from(this.userCache.entries()).filter((entry): entry is [string, UserRecord] => Boolean(entry[1])));
  }

  chatMap() {
    return new Map(Array.from(this.chatCache.entries()).filter((entry): entry is [string, ChatRecord] => Boolean(entry[1])));
  }
}

function requireText(sourceRef: SourceRef, key: string) {
  const value = sourceRef[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required sourceRef.${key}`);
  }
  return value;
}

async function indexSingleProfile(userId: string, stats: SyncProcessingStats) {
  const user = await getUserById(userId);
  if (!user) {
    const task = await deleteDocuments(SEARCH_INDEXES.profiles, [userId], {
      customMetadata: `sync:profile-missing:${userId}`,
    });
    const completed = await waitForTask(task.taskUid);
    addTask(stats, completed);
    return;
  }

  const historyMap = await getUserHistoryForBatch([userId]);
  const documents = buildProfileDocuments([user], historyMap);
  const task = await updateDocuments(SEARCH_INDEXES.profiles, documents, {
    customMetadata: `sync:profile-upsert:${userId}`,
  });
  const completed = await waitForTask(task.taskUid);
  addTask(stats, completed);
  stats.profiles += documents.length;
}

async function indexSingleChat(chatId: string, stats: SyncProcessingStats) {
  const chat = await getChatById(chatId);
  if (!chat) {
    const task = await deleteDocuments(SEARCH_INDEXES.chats, [chatId], {
      customMetadata: `sync:chat-missing:${chatId}`,
    });
    const completed = await waitForTask(task.taskUid);
    addTask(stats, completed);
    return;
  }

  const documents = buildChatDocuments([chat]);
  const task = await updateDocuments(SEARCH_INDEXES.chats, documents, {
    customMetadata: `sync:chat-upsert:${chatId}`,
  });
  const completed = await waitForTask(task.taskUid);
  addTask(stats, completed);
  stats.chats += documents.length;
}

async function loadMessageFromSource(sourceRef: SourceRef) {
  const chatId = requireText(sourceRef, "chatId");
  const messageId = requireText(sourceRef, "messageId");
  const bucket = typeof sourceRef.bucket === "string" ? sourceRef.bucket : null;
  const timestamp = typeof sourceRef.timestamp === "string" ? sourceRef.timestamp : null;

  let message = await getMessageById(chatId, messageId);
  if (!message && bucket && timestamp) {
    message = await getMessageByChatBucketTimestamp(chatId, bucket, timestamp, messageId);
  }

  return message;
}

async function indexSingleMessage(sourceRef: SourceRef, context: SearchSyncContext, stats: SyncProcessingStats) {
  const chatId = requireText(sourceRef, "chatId");
  const messageId = requireText(sourceRef, "messageId");
  const message = await loadMessageFromSource(sourceRef);

  if (!message) {
    const task = await deleteDocuments(SEARCH_INDEXES.messages, [`${chatId}_${messageId}`], {
      customMetadata: `sync:message-missing:${chatId}:${messageId}`,
    });
    const completed = await waitForTask(task.taskUid);
    addTask(stats, completed);
    return;
  }

  await context.hydrateChats([message.chat_id]);
  await context.hydrateUsers(message.user_id ? [message.user_id] : []);
  const documents = buildMessageDocumentsFromMaps([message], context.userMap(), context.chatMap());
  const task = await updateDocuments(SEARCH_INDEXES.messages, documents, {
    customMetadata: `sync:message-upsert:${chatId}:${messageId}`,
  });
  const completed = await waitForTask(task.taskUid);
  addTask(stats, completed);
  stats.messages += documents.length;
}

async function refreshMessagesForUser(userId: string, context: SearchSyncContext, stats: SyncProcessingStats) {
  await context.hydrateUsers([userId]);
  const config = getSyncConfig();

  for await (const page of streamAllMessagesFromUsers([userId], {
    fetchSize: config.cassandraPageSize,
    concurrency: 1,
    bucketStartYear: config.bucketStartYear,
    bucketStartMonth: config.bucketStartMonth,
  })) {
    await context.hydrateChats(page.map((message) => message.chat_id));
    const documents = buildMessageDocumentsFromMaps(page, context.userMap(), context.chatMap());
    if (documents.length === 0) {
      continue;
    }
    const task = await updateDocuments(SEARCH_INDEXES.messages, documents, {
      customMetadata: `sync:user-refresh:${userId}`,
    });
    const completed = await waitForTask(task.taskUid);
    addTask(stats, completed);
    stats.messages += documents.length;
  }
}

async function refreshMessagesForChat(chatId: string, context: SearchSyncContext, stats: SyncProcessingStats) {
  await context.hydrateChats([chatId]);
  const config = getSyncConfig();

  for await (const page of streamAllMessagesFromChats([chatId], {
    fetchSize: config.cassandraPageSize,
    concurrency: 1,
    bucketStartYear: config.bucketStartYear,
    bucketStartMonth: config.bucketStartMonth,
  })) {
    await context.hydrateUsers(page.map((message) => message.user_id).filter(Boolean) as string[]);
    const documents = buildMessageDocumentsFromMaps(page, context.userMap(), context.chatMap());
    if (documents.length === 0) {
      continue;
    }
    const task = await updateDocuments(SEARCH_INDEXES.messages, documents, {
      customMetadata: `sync:chat-refresh:${chatId}`,
    });
    const completed = await waitForTask(task.taskUid);
    addTask(stats, completed);
    stats.messages += documents.length;
  }
}

async function processEvent(event: SearchIndexOutboxRecord, context: SearchSyncContext, stats: SyncProcessingStats) {
  switch (event.event_type) {
    case "profile_upsert": {
      const userId = requireText(event.source_ref, "userId");
      await indexSingleProfile(userId, stats);
      await enqueueSearchIndexEvents([
        {
          eventType: "profile_messages_refresh",
          scope: "messages",
          entityKey: `profile:${userId}:messages`,
          sourceRef: { userId },
        },
      ]);
      return;
    }
    case "profile_delete": {
      const userId = requireText(event.source_ref, "userId");
      const task = await deleteDocuments(SEARCH_INDEXES.profiles, [userId], {
        customMetadata: `sync:profile-delete:${userId}`,
      });
      const completed = await waitForTask(task.taskUid);
      addTask(stats, completed);
      return;
    }
    case "chat_upsert": {
      const chatId = requireText(event.source_ref, "chatId");
      await indexSingleChat(chatId, stats);
      await enqueueSearchIndexEvents([
        {
          eventType: "chat_messages_refresh",
          scope: "messages",
          entityKey: `chat:${chatId}:messages`,
          sourceRef: { chatId },
        },
      ]);
      return;
    }
    case "chat_delete": {
      const chatId = requireText(event.source_ref, "chatId");
      const task = await deleteDocuments(SEARCH_INDEXES.chats, [chatId], {
        customMetadata: `sync:chat-delete:${chatId}`,
      });
      const completed = await waitForTask(task.taskUid);
      addTask(stats, completed);
      return;
    }
    case "message_upsert":
      await indexSingleMessage(event.source_ref, context, stats);
      return;
    case "message_delete": {
      const chatId = requireText(event.source_ref, "chatId");
      const messageId = requireText(event.source_ref, "messageId");
      const task = await deleteDocuments(SEARCH_INDEXES.messages, [`${chatId}_${messageId}`], {
        customMetadata: `sync:message-delete:${chatId}:${messageId}`,
      });
      const completed = await waitForTask(task.taskUid);
      addTask(stats, completed);
      return;
    }
    case "profile_messages_refresh": {
      const userId = requireText(event.source_ref, "userId");
      await refreshMessagesForUser(userId, context, stats);
      return;
    }
    case "chat_messages_refresh": {
      const chatId = requireText(event.source_ref, "chatId");
      await refreshMessagesForChat(chatId, context, stats);
      return;
    }
    default:
      throw new Error(`Unsupported search index event type: ${event.event_type}`);
  }
}

export async function consumeSearchIndexOutbox(scopes?: SearchIndexScope[]) {
  const normalizedScopes: SearchIndexScope[] = scopes && scopes.length > 0
    ? scopes
    : ["profiles", "chats", "messages"];
  const config = getSyncConfig();
  const context = new SearchSyncContext();
  const stats = createInitialStats();
  const run = await createSearchIndexRun({
    mode: "sync",
    scopes: normalizedScopes,
  });

  try {
    while (true) {
      const events = await claimSearchIndexEvents(config.outboxBatchSize, normalizedScopes);
      if (events.length === 0) {
        break;
      }

      const processedIds: number[] = [];
      for (const event of events) {
        try {
          await processEvent(event, context, stats);
          processedIds.push(event.id);
          stats.processedEvents += 1;
        } catch (error) {
          await retrySearchIndexEvent(event.id, error, config.retryDelaySeconds);
        }
      }

      await markSearchIndexEventsProcessed(processedIds);
    }

    const progressSummary = await buildBatchProgressSummary(stats.batchUids);
    await markSearchIndexRunSucceeded(run.id, {
      indexedCounts: {
        profiles: stats.profiles,
        chats: stats.chats,
        messages: stats.messages,
      },
      metadata: {
        processedEvents: stats.processedEvents,
        backend: getSearchBackend(),
      },
      taskUids: stats.taskUids,
      batchUids: stats.batchUids,
      progressSummary,
    });

    return {
      processedEvents: stats.processedEvents,
      profiles: stats.profiles,
      chats: stats.chats,
      messages: stats.messages,
      runId: run.id,
    };
  } catch (error) {
    await markSearchIndexRunFailed(run.id, error, {
      indexedCounts: {
        profiles: stats.profiles,
        chats: stats.chats,
        messages: stats.messages,
      },
      metadata: {
        processedEvents: stats.processedEvents,
        backend: getSearchBackend(),
      },
      taskUids: stats.taskUids,
      batchUids: stats.batchUids,
    });
    throw error;
  }
}

export async function syncSearchDocuments(scopes?: SearchIndexScope[]) {
  if (isLegacySearchSyncEnabled()) {
    return legacySyncSearchDocuments(scopes);
  }

  return consumeSearchIndexOutbox(scopes);
}

export function enqueueSearchIndexMutations(events: EnqueueSearchIndexEventInput[]) {
  return enqueueSearchIndexEvents(events);
}
