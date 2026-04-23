import {
  isTrackedSearchTaskId,
  getOpenSearchSwapDetails,
  getSearchBackend,
  type MeilisearchBatch,
  type MeilisearchTask,
  SEARCH_INDEXES,
  type SearchIndexMap,
  configureSearchIndices,
  deleteAllDocuments,
  deleteIndex,
  getBatch,
  getIndexStats,
  replaceDocuments,
  swapIndexes,
  updateDocuments,
  waitForTask,
} from "./searchIndex";
import {
  createSearchIndexRun,
  getSearchIndexRunByShadowHint,
  getLatestResumableFullReindex,
  getSearchIndexRun,
  type SearchIndexRunRecord,
  markSearchIndexRunFailed,
  markSearchIndexRunSucceeded,
  type SearchIndexScope,
  updateSearchIndexRun,
} from "../db/searchIndexing";
import { buildContentCharacterSet, containsLink } from "./searchHelpers";
import {
  listAllChats,
  listAllMessages,
  listAllUsers,
  listUsersByIds,
  streamAllMessages,
  streamAllMessagesFromChatTable,
  streamAllMessagesFromChats,
  streamAllMessagesFromUserTable,
  streamAllMessagesFromUsers,
  formatMessageBucket,
  getUserHistoryForBatch,
  type ChatRecord,
  type MessageRecord,
  type UserRecord,
  type HistoryRecordLight,
} from "./queries";

const INDEX_TASK_TIMEOUT = 600_000;
const DEFAULT_BATCH_SIZE = 5000;
const DEFAULT_UPLOAD_CONCURRENCY = 2;
const DEFAULT_CASSANDRA_PAGE_SIZE = 10000;
const DEFAULT_FLUSH_MULTIPLIER = 4;
const DEFAULT_CHAT_SCAN_CONCURRENCY = 12;
const DEFAULT_USER_SCAN_CONCURRENCY = 12;
const DEFAULT_BUCKET_START_YEAR = 2013;
const DEFAULT_BUCKET_START_MONTH = 1;
const DEFAULT_MESSAGE_SCAN_MODE = "partition_scan";
const DEFAULT_AUTO_PRUNE_SHADOW_INDEXES = true;
const DEFAULT_EARLY_MESSAGE_SWAP = true;
const VALID_MESSAGE_PHASES = ["messages_by_chat", "messages_by_user", "messages_by_id"] as const;
const VALID_MESSAGE_SCAN_MODES = ["table_scan", "partition_scan"] as const;

type MessagePhase = typeof VALID_MESSAGE_PHASES[number];
type MessageScanMode = typeof VALID_MESSAGE_SCAN_MODES[number];

type IndexerConfig = {
  batchSize: number;
  uploadConcurrency: number;
  cassandraPageSize: number;
  flushMultiplier: number;
  chatScanConcurrency: number;
  userScanConcurrency: number;
  bucketStartYear: number;
  bucketStartMonth: number;
  messageScanMode: MessageScanMode;
  autoPruneShadowIndexes: boolean;
  earlyMessageSwap: boolean;
  reindexPhases: MessagePhase[];
  syncPhases: MessagePhase[];
};

type ProfileDocument = {
  userId: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  profilePhoto: string | null;
  phoneHash: string | null;
  phoneMasked: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isTelegramPremium: boolean | null;
};

type ChatDocument = {
  chatId: string;
  chatType: string | null;
  username: string | null;
  title: string | null;
  description: string | null;
  memberCount: number | null;
  participantCount: number | null;
  profilePhoto: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type MessageDocument = {
  documentId: string;
  messageId: string;
  chatId: string;
  senderId: string | null;
  senderUsername: string | null;
  senderDisplayName: string | null;
  chatTitle: string | null;
  chatType: string | null;
  chatUsername: string | null;
  content: string;
  contentCharacterSet: string[];
  hasMedia: boolean | null;
  containsLinks: boolean | null;
  contentLength: number;
  bucket: string | null;
  timestamp: string | null;
  timestampMs: number | null;
};

type UploadSummary = {
  taskUids: number[];
  batchUids: number[];
};

type IndexWriteSummary = UploadSummary & {
  count: number;
};

type ReindexResult = {
  profiles: number;
  chats: number;
  messages: number;
  runId: string;
  shadowIndexes: SearchIndexMap;
};

type ReindexExecutionOptions = {
  runId: string;
  shadowIndexes: SearchIndexMap;
  scopes: SearchIndexScope[];
  resume?: boolean;
};

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toTimestampMs(value: Date | string | null | undefined) {
  const isoString = toIsoString(value);
  if (!isoString) {
    return null;
  }

  const parsed = new Date(isoString);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function getLatestHistoryValue(records: HistoryRecordLight[], field: string): string | null {
  const fieldRecords = records.filter((record) => record.field === field);
  if (fieldRecords.length === 0) {
    return null;
  }

  fieldRecords.sort((left, right) => {
    const leftDate = left.changed_at instanceof Date ? left.changed_at : new Date(left.changed_at);
    const rightDate = right.changed_at instanceof Date ? right.changed_at : new Date(right.changed_at);
    return rightDate.getTime() - leftDate.getTime();
  });

  return fieldRecords[0].new_value ?? null;
}

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[indexer] ignoring invalid ${name}="${raw}"`);
    return fallback;
  }

  return parsed;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function parseMessageScanMode(name: string, fallback: MessageScanMode): MessageScanMode {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  if ((VALID_MESSAGE_SCAN_MODES as readonly string[]).includes(raw)) {
    return raw as MessageScanMode;
  }

  console.warn(`[indexer] ignoring invalid ${name}="${raw}"`);
  return fallback;
}

function parseMessagePhases(name: string, fallback: MessagePhase[]) {
  const raw = process.env[name];
  if (!raw) {
    return Array.from(new Set(fallback));
  }

  const phases = raw
    .split(",")
    .map((value) => value.trim())
    .filter(
      (value): value is MessagePhase =>
        (VALID_MESSAGE_PHASES as readonly string[]).includes(value)
    );

  if (phases.length === 0) {
    console.warn(`[indexer] ignoring invalid ${name}="${raw}"`);
    return fallback;
  }

  return Array.from(new Set(phases));
}

function ensureRequiredMessagePhases(phases: MessagePhase[], requiredPhases: MessagePhase[]) {
  const normalized = Array.from(new Set(phases));
  let added = false;

  for (const phase of requiredPhases) {
    if (!normalized.includes(phase)) {
      normalized.push(phase);
      added = true;
    }
  }

  if (added) {
    console.warn(
      `[indexer] required message phases restored automatically: ${requiredPhases.join(", ")}`
    );
  }

  return normalized;
}

function getIndexerConfig(): IndexerConfig {
  return {
    batchSize: readPositiveIntEnv("SEARCH_INDEX_BATCH_SIZE", DEFAULT_BATCH_SIZE),
    uploadConcurrency: readPositiveIntEnv(
      "SEARCH_INDEX_UPLOAD_CONCURRENCY",
      DEFAULT_UPLOAD_CONCURRENCY
    ),
    cassandraPageSize: readPositiveIntEnv(
      "SEARCH_INDEX_CASSANDRA_PAGE_SIZE",
      DEFAULT_CASSANDRA_PAGE_SIZE
    ),
    flushMultiplier: readPositiveIntEnv(
      "SEARCH_INDEX_FLUSH_MULTIPLIER",
      DEFAULT_FLUSH_MULTIPLIER
    ),
    chatScanConcurrency: readPositiveIntEnv(
      "SEARCH_INDEX_CHAT_SCAN_CONCURRENCY",
      DEFAULT_CHAT_SCAN_CONCURRENCY
    ),
    userScanConcurrency: readPositiveIntEnv(
      "SEARCH_INDEX_USER_SCAN_CONCURRENCY",
      DEFAULT_USER_SCAN_CONCURRENCY
    ),
    bucketStartYear: readPositiveIntEnv(
      "SEARCH_INDEX_BUCKET_START_YEAR",
      DEFAULT_BUCKET_START_YEAR
    ),
    bucketStartMonth: Math.min(
      12,
      Math.max(
        1,
        readPositiveIntEnv("SEARCH_INDEX_BUCKET_START_MONTH", DEFAULT_BUCKET_START_MONTH)
      )
    ),
    messageScanMode: parseMessageScanMode(
      "SEARCH_INDEX_MESSAGE_SCAN_MODE",
      DEFAULT_MESSAGE_SCAN_MODE
    ),
    autoPruneShadowIndexes: readBooleanEnv(
      "SEARCH_INDEX_AUTO_PRUNE_SHADOW_INDEXES",
      DEFAULT_AUTO_PRUNE_SHADOW_INDEXES
    ),
    earlyMessageSwap: readBooleanEnv(
      "SEARCH_INDEX_EARLY_MESSAGE_SWAP",
      DEFAULT_EARLY_MESSAGE_SWAP
    ),
    reindexPhases: ensureRequiredMessagePhases(
      parseMessagePhases("SEARCH_INDEX_REINDEX_PHASES", ["messages_by_chat"]),
      ["messages_by_chat"]
    ),
    syncPhases: ensureRequiredMessagePhases(
      parseMessagePhases("SEARCH_INDEX_SYNC_PHASES", [
        "messages_by_chat",
        "messages_by_user",
        "messages_by_id",
      ]),
      ["messages_by_chat", "messages_by_user", "messages_by_id"]
    ),
  };
}

function createShadowIndexes(runId: string): SearchIndexMap {
  const suffix = runId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toLowerCase();
  return {
    profiles: `${SEARCH_INDEXES.profiles}__shadow_${suffix}`,
    chats: `${SEARCH_INDEXES.chats}__shadow_${suffix}`,
    messages: `${SEARCH_INDEXES.messages}__shadow_${suffix}`,
  };
}

function collectTaskSummary(tasks: MeilisearchTask[]): UploadSummary {
  return {
    taskUids: Array.from(
      new Set(
        tasks
          .map((task) => task.taskUid)
          .filter((taskUid): taskUid is number => isTrackedSearchTaskId(taskUid))
      )
    ),
    batchUids: Array.from(
      new Set(
        tasks
          .map((task) => task.batchUid ?? null)
          .filter(
            (batchUid): batchUid is number =>
              isTrackedSearchTaskId(batchUid)
          )
      )
    ),
  };
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

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let running = 0;
  let nextIndex = 0;

  return new Promise<void>((resolve, reject) => {
    function tryNext() {
      while (running < concurrency && nextIndex < items.length) {
        const idx = nextIndex++;
        running += 1;
        fn(items[idx], idx)
          .then(() => {
            running -= 1;
            if (nextIndex >= items.length && running === 0) {
              resolve();
            } else {
              tryNext();
            }
          })
          .catch(reject);
      }

      if (items.length === 0) {
        resolve();
      }
    }

    tryNext();
  });
}

export function buildProfileDocuments(
  users: UserRecord[],
  historyMap?: Map<string, HistoryRecordLight[]>
): ProfileDocument[] {
  return users.map((user) => {
    const historyRecords = historyMap?.get(user.user_id) || [];
    const historyDisplayName = getLatestHistoryValue(historyRecords, "display_name");
    const historyBio = getLatestHistoryValue(historyRecords, "bio");
    const historyUsernames = getLatestHistoryValue(historyRecords, "usernames");
    let effectiveUsername = user.username ?? null;
    if (!effectiveUsername && historyUsernames) {
      try {
        const usernamesArray = JSON.parse(historyUsernames);
        effectiveUsername = Array.isArray(usernamesArray)
          ? usernamesArray[usernamesArray.length - 1]
          : usernamesArray;
      } catch {
        effectiveUsername = historyUsernames;
      }
    }

    return {
      userId: user.user_id,
      username: effectiveUsername,
      displayName: historyDisplayName ?? user.display_name ?? null,
      bio: historyBio ?? user.bio ?? null,
      profilePhoto: user.avatar_url ?? null,
      phoneHash: user.phone_hash ?? null,
      phoneMasked: user.phone_masked ?? null,
      createdAt: toIsoString(user.created_at),
      updatedAt: toIsoString(user.updated_at),
      isTelegramPremium: user.is_premium ?? null,
    };
  });
}

export function buildChatDocuments(chats: ChatRecord[]): ChatDocument[] {
  return chats.map((chat) => ({
    chatId: chat.chat_id,
    chatType: chat.chat_type ?? null,
    username: chat.username ?? null,
    title: chat.display_name ?? null,
    description: chat.bio ?? null,
    memberCount: chat.member_count ?? null,
    participantCount: chat.participants_count ?? null,
    profilePhoto: chat.avatar_url ?? null,
    createdAt: toIsoString(chat.created_at),
    updatedAt: toIsoString(chat.updated_at),
  }));
}

export function buildMessageDocumentsFromMaps(
  messages: MessageRecord[],
  userMap: Map<string, UserRecord>,
  chatMap: Map<string, ChatRecord>
): MessageDocument[] {
  return messages.map((message) => {
    const sender = message.user_id ? userMap.get(message.user_id) : null;
    const chat = chatMap.get(message.chat_id);
    const content = String(message.content ?? "");

    return {
      documentId: `${message.chat_id}_${message.message_id}`,
      messageId: String(message.message_id),
      chatId: String(message.chat_id),
      senderId: message.user_id ?? null,
      senderUsername: sender?.username ?? null,
      senderDisplayName: sender?.display_name ?? null,
      chatTitle: chat?.display_name ?? null,
      chatType: chat?.chat_type ?? null,
      chatUsername: chat?.username ?? null,
      content,
      contentCharacterSet: buildContentCharacterSet(content),
      hasMedia: message.has_media ?? Boolean(message.media_type || message.media_url),
      containsLinks: containsLink(content),
      contentLength: content.length,
      bucket: message.bucket ?? formatMessageBucket(message.timestamp ?? message.created_at),
      timestamp: toIsoString(message.timestamp ?? message.created_at),
      timestampMs: toTimestampMs(message.timestamp ?? message.created_at),
    };
  });
}

export function buildMessageDocuments(
  messages: MessageRecord[],
  users: UserRecord[],
  chats: ChatRecord[]
): MessageDocument[] {
  const userMap = new Map(users.map((user) => [user.user_id, user]));
  const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));
  return buildMessageDocumentsFromMaps(messages, userMap, chatMap);
}

async function uploadDocumentsConcurrently<T extends Record<string, unknown>>(
  indexName: string,
  documents: T[],
  uploadFn: typeof replaceDocuments | typeof updateDocuments,
  config: IndexerConfig,
  customMetadataPrefix?: string
): Promise<UploadSummary> {
  const chunks = chunkArray(documents, config.batchSize);
  console.log(
    `[indexer] uploading ${documents.length} docs to "${indexName}" in ${chunks.length} batches ` +
    `(concurrency: ${config.uploadConcurrency})...`
  );

  const submittedTasks: MeilisearchTask[] = [];
  let completed = 0;
  await runWithConcurrency(chunks, config.uploadConcurrency, async (chunk, idx) => {
    const task = await uploadFn(indexName, chunk, {
      customMetadata: customMetadataPrefix
        ? `${customMetadataPrefix}:chunk-${idx + 1}`
        : undefined,
    });
    submittedTasks.push(task);
    await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    completed += chunk.length;
    if (completed % 50000 < config.batchSize || idx === chunks.length - 1) {
      console.log(`[indexer] "${indexName}": ${completed}/${documents.length} docs`);
    }
  });

  return collectTaskSummary(submittedTasks);
}

async function replaceIndexDocuments<T extends Record<string, unknown>>(
  indexName: string,
  documents: T[],
  config: IndexerConfig,
  customMetadataPrefix?: string
): Promise<IndexWriteSummary> {
  console.log(`[indexer] replacing ${documents.length} documents in "${indexName}"...`);
  const deleteTask = await deleteAllDocuments(indexName, {
    customMetadata: customMetadataPrefix ? `${customMetadataPrefix}:delete-all` : undefined,
  });
  await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);
  const uploadSummary = await uploadDocumentsConcurrently(
    indexName,
    documents,
    replaceDocuments,
    config,
    customMetadataPrefix
  );

  return {
    count: documents.length,
    taskUids: [
      ...(isTrackedSearchTaskId(deleteTask.taskUid) ? [deleteTask.taskUid] : []),
      ...uploadSummary.taskUids,
    ],
    batchUids: Array.from(
      new Set([
        ...(isTrackedSearchTaskId(deleteTask.batchUid) ? [deleteTask.batchUid] : []),
        ...uploadSummary.batchUids,
      ])
    ),
  };
}

async function syncIndexDocuments<T extends Record<string, unknown>>(
  indexName: string,
  documents: T[],
  config: IndexerConfig,
  customMetadataPrefix?: string
): Promise<IndexWriteSummary> {
  console.log(`[indexer] syncing ${documents.length} documents into "${indexName}"...`);
  const uploadSummary = await uploadDocumentsConcurrently(
    indexName,
    documents,
    updateDocuments,
    config,
    customMetadataPrefix
  );

  return {
    count: documents.length,
    ...uploadSummary,
  };
}

function getMessagePhases(mode: "replace" | "sync", config: IndexerConfig): MessagePhase[] {
  return mode === "replace" ? config.reindexPhases : config.syncPhases;
}

async function streamIndexMessages(
  userMap: Map<string, UserRecord>,
  chatMap: Map<string, ChatRecord>,
  mode: "replace" | "sync",
  config: IndexerConfig,
  options?: {
    indexName?: string;
    phases?: MessagePhase[];
    customMetadataPrefix?: string;
  }
): Promise<IndexWriteSummary> {
  const targetIndexName = options?.indexName ?? SEARCH_INDEXES.messages;
  let totalIndexed = 0;
  let pendingDocs: MessageDocument[] = [];
  const uploadFn = mode === "replace" ? replaceDocuments : updateDocuments;
  const phases = options?.phases ?? getMessagePhases(mode, config);
  const submittedTasks: MeilisearchTask[] = [];
  let deleteTask: MeilisearchTask | null = null;

  if (mode === "replace") {
    console.log(`[indexer] clearing messages index "${targetIndexName}" before streaming...`);
    deleteTask = await deleteAllDocuments(targetIndexName, {
      customMetadata: options?.customMetadataPrefix
        ? `${options.customMetadataPrefix}:delete-all`
        : undefined,
    });
    await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);
  }

  const flushThreshold = config.batchSize * config.flushMultiplier;

  async function flush() {
    if (pendingDocs.length === 0) {
      return;
    }

    const toUpload = pendingDocs;
    pendingDocs = [];

    const chunks = chunkArray(toUpload, config.batchSize);
    await runWithConcurrency(chunks, config.uploadConcurrency, async (chunk, idx) => {
      const task = await uploadFn(targetIndexName, chunk, {
        customMetadata: options?.customMetadataPrefix
          ? `${options.customMetadataPrefix}:messages-${totalIndexed + idx + 1}`
          : undefined,
      });
      submittedTasks.push(task);
      await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    });

    totalIndexed += toUpload.length;
    console.log(`[indexer] messages: ${totalIndexed} indexed...`);
  }

  async function deduplicateAndBuild(messagePage: MessageRecord[]) {
    const seenInPage = new Set<string>();
    const newMessages = messagePage.filter((message) => {
      const key = `${message.chat_id}:${message.message_id}`;
      if (seenInPage.has(key)) {
        return false;
      }
      seenInPage.add(key);
      return true;
    });

    if (newMessages.length === 0) {
      return [];
    }

    const missingUserIds = Array.from(
      new Set(
        newMessages
          .map((message) => message.user_id ?? null)
          .filter((userId): userId is string => Boolean(userId) && !userMap.has(userId))
      )
    );
    if (missingUserIds.length > 0) {
      const users = await listUsersByIds(missingUserIds);
      for (const user of users) {
        userMap.set(user.user_id, user);
      }
    }

    return buildMessageDocumentsFromMaps(newMessages, userMap, chatMap);
  }

  async function scanPhase(phase: MessagePhase, scanMode: MessageScanMode, phaseLabel: string) {
    if (phase === "messages_by_chat") {
      if (scanMode === "table_scan") {
        console.log(`[indexer] ${phaseLabel}: streaming messages_by_chat (full table scan)...`);
        for await (const messagePage of streamAllMessagesFromChatTable(config.cassandraPageSize)) {
          if (messagePage.length === 0) {
            continue;
          }
          const documents = await deduplicateAndBuild(messagePage);
          if (documents.length > 0) {
            pendingDocs.push(...documents);
          }
          if (pendingDocs.length >= flushThreshold) {
            await flush();
          }
        }
      } else {
        const chatIds = Array.from(chatMap.keys());
        console.log(`[indexer] ${phaseLabel}: streaming messages_by_chat (${chatIds.length} chats)...`);
        for await (const messagePage of streamAllMessagesFromChats(chatIds, {
          fetchSize: config.cassandraPageSize,
          concurrency: config.chatScanConcurrency,
          bucketStartYear: config.bucketStartYear,
          bucketStartMonth: config.bucketStartMonth,
        })) {
          if (messagePage.length === 0) {
            continue;
          }
          const documents = await deduplicateAndBuild(messagePage);
          if (documents.length > 0) {
            pendingDocs.push(...documents);
          }
          if (pendingDocs.length >= flushThreshold) {
            await flush();
          }
        }
      }
      return;
    }

    if (phase === "messages_by_user") {
      if (scanMode === "table_scan") {
        console.log(`[indexer] ${phaseLabel}: streaming messages_by_user (full table scan)...`);
        for await (const messagePage of streamAllMessagesFromUserTable(config.cassandraPageSize)) {
          if (messagePage.length === 0) {
            continue;
          }
          const documents = await deduplicateAndBuild(messagePage);
          if (documents.length > 0) {
            pendingDocs.push(...documents);
          }
          if (pendingDocs.length >= flushThreshold) {
            await flush();
          }
        }
      } else {
        const userIds = Array.from(userMap.keys());
        console.log(`[indexer] ${phaseLabel}: streaming messages_by_user (${userIds.length} users)...`);
        for await (const messagePage of streamAllMessagesFromUsers(userIds, {
          fetchSize: config.cassandraPageSize,
          concurrency: config.userScanConcurrency,
          bucketStartYear: config.bucketStartYear,
          bucketStartMonth: config.bucketStartMonth,
        })) {
          if (messagePage.length === 0) {
            continue;
          }
          const documents = await deduplicateAndBuild(messagePage);
          if (documents.length > 0) {
            pendingDocs.push(...documents);
          }
          if (pendingDocs.length >= flushThreshold) {
            await flush();
          }
        }
      }
      return;
    }

    console.log(`[indexer] ${phaseLabel}: streaming messages_by_id...`);
    for await (const messagePage of streamAllMessages(config.cassandraPageSize)) {
      if (messagePage.length === 0) {
        continue;
      }
      const documents = await deduplicateAndBuild(messagePage);
      if (documents.length > 0) {
        pendingDocs.push(...documents);
      }
      if (pendingDocs.length >= flushThreshold) {
        await flush();
      }
    }
  }

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    const phase = phases[phaseIndex];
    const phaseLabel = `phase ${phaseIndex + 1}/${phases.length}`;
    const phaseStartCount = totalIndexed;
    await scanPhase(phase, config.messageScanMode, phaseLabel);

    await flush();
    if (
      (phase === "messages_by_chat" || phase === "messages_by_user")
      && totalIndexed === phaseStartCount
    ) {
      if (config.messageScanMode === "partition_scan") {
        console.warn(
          `[indexer] ${phase} returned 0 messages via partition scan. ` +
          `Falling back to full table scan because the configured bucket range may not match the stored partition keys. ` +
          `Current bucketStart=${config.bucketStartYear}-${String(config.bucketStartMonth).padStart(2, "0")}.`
        );
        await scanPhase(phase, "table_scan", `${phaseLabel} fallback`);
        await flush();
      }

      if (totalIndexed === phaseStartCount) {
        const scanHint =
          config.messageScanMode === "partition_scan"
            ? `This usually means the configured bucket scan range does not match the Cassandra data. Current bucketStart=${config.bucketStartYear}-${String(config.bucketStartMonth).padStart(2, "0")}.`
            : "This usually means the source table is empty or Cassandra returned no rows for the full table scan.";
        console.warn(`[indexer] ${phase} returned 0 messages. ${scanHint}`);
      }
    }
    console.log(
      `[indexer] ${phaseLabel} complete: +${totalIndexed - phaseStartCount} new from ${phase}`
    );
  }

  console.log(
    `[indexer] messages: ALL PHASES DONE — ${totalIndexed} total write operations submitted`
  );
  const taskSummary = collectTaskSummary(submittedTasks);
  const finalCount = mode === "replace"
    ? (await getIndexStats(targetIndexName)).numberOfDocuments
    : totalIndexed;
  return {
    count: finalCount,
    taskUids: deleteTask
      ? [
          ...(isTrackedSearchTaskId(deleteTask.taskUid) ? [deleteTask.taskUid] : []),
          ...taskSummary.taskUids,
        ]
      : taskSummary.taskUids,
    batchUids: Array.from(
      new Set([
        ...(deleteTask && isTrackedSearchTaskId(deleteTask.batchUid) ? [deleteTask.batchUid] : []),
        ...taskSummary.batchUids,
      ])
    ),
  };
}

export async function loadSearchSourceData(
  scopes: Array<"profiles" | "chats" | "messages"> = ["profiles", "chats", "messages"]
) {
  const needsProfiles = scopes.includes("profiles");
  const needsChats = scopes.includes("chats");
  const needsMessages = scopes.includes("messages");

  console.log(`[indexer] loading source data for scopes: ${scopes.join(", ")}...`);

  const [users, chats, messages] = await Promise.all([
    needsProfiles || needsMessages ? listAllUsers() : Promise.resolve([] as UserRecord[]),
    needsChats || needsMessages ? listAllChats() : Promise.resolve([] as ChatRecord[]),
    needsMessages ? listAllMessages() : Promise.resolve([] as MessageRecord[]),
  ]);

  console.log(
    `[indexer] loaded: ${users.length} users, ${chats.length} chats, ${messages.length} messages`
  );

  const userIds = needsProfiles ? users.map((user) => user.user_id) : [];
  const historyMap =
    userIds.length > 0
      ? await getUserHistoryForBatch(userIds)
      : new Map<string, HistoryRecordLight[]>();

  return { users, chats, messages, historyMap };
}

function normalizeReindexScopes(scopes?: SearchIndexScope[]) {
  const normalized = scopes && scopes.length > 0
    ? Array.from(new Set(scopes))
    : (["profiles", "chats", "messages"] as SearchIndexScope[]);
  return normalized;
}

function collectOpenSearchIndicesToPrune(tasks: Array<MeilisearchTask | null | undefined>) {
  return Array.from(new Set(
    tasks.flatMap((task) =>
      getOpenSearchSwapDetails(task).flatMap((detail) => detail.previousLiveTargets)
    )
  ));
}

async function executeFullReindex(options: ReindexExecutionOptions): Promise<ReindexResult> {
  const startLabel = options.resume ? "RESUME REINDEX" : "FULL REINDEX";
  console.log(`[indexer] === ${startLabel} START ===`);
  const startTime = Date.now();
  const config = getIndexerConfig();
  const normalizedScopes = normalizeReindexScopes(options.scopes);
  const rebuildProfiles = normalizedScopes.includes("profiles");
  const rebuildChats = normalizedScopes.includes("chats");
  const rebuildMessages = normalizedScopes.includes("messages");
  const runId = options.runId;
  const shadowIndexes = options.shadowIndexes;
  console.log(
    `[indexer] config: batch=${config.batchSize}, uploadConcurrency=${config.uploadConcurrency}, ` +
    `pageSize=${config.cassandraPageSize}, flushMultiplier=${config.flushMultiplier}, ` +
    `chatScanConcurrency=${config.chatScanConcurrency}, userScanConcurrency=${config.userScanConcurrency}, ` +
    `scanMode=${config.messageScanMode}, ` +
    `bucketStart=${config.bucketStartYear}-${String(config.bucketStartMonth).padStart(2, "0")}, ` +
    `earlyMessageSwap=${config.earlyMessageSwap}, ` +
    `resume=${options.resume ? "true" : "false"}, ` +
    `scopes=${normalizedScopes.join(",")}, ` +
    `messagePhases=${config.reindexPhases.join(" -> ")}`
  );

  try {
    await updateSearchIndexRun(runId, {
      status: "running",
      errorText: null,
      finishedAt: null,
      metadata: {
        liveIndexes: SEARCH_INDEXES,
        shadowIndexes,
        backend: getSearchBackend(),
        resumedAt: options.resume ? new Date().toISOString() : undefined,
      },
    });
    await configureSearchIndices(shadowIndexes);

    console.log("[indexer] loading Cassandra source data...");
    const [users, chats] = await Promise.all([
      rebuildProfiles ? listAllUsers() : Promise.resolve([] as UserRecord[]),
      rebuildChats || rebuildMessages ? listAllChats() : Promise.resolve([] as ChatRecord[]),
    ]);
    console.log(`[indexer] loaded ${users.length} users, ${chats.length} chats`);

    const userIds = users.map((user) => user.user_id);
    const historyMap =
      userIds.length > 0
        ? await getUserHistoryForBatch(userIds)
        : new Map<string, HistoryRecordLight[]>();
    console.log(`[indexer] loaded history for ${historyMap.size} users`);

    await updateSearchIndexRun(runId, {
      sourceCounts: {
        profiles: rebuildProfiles ? users.length : 0,
        chats: rebuildChats ? chats.length : 0,
      },
    });

    const userMap = new Map(users.map((user) => [user.user_id, user]));
    const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));

    console.log(`[indexer] indexing scopes into shadow indexes: ${normalizedScopes.join(", ")}...`);
    const profilePromise = rebuildProfiles
      ? replaceIndexDocuments(
        shadowIndexes.profiles,
        buildProfileDocuments(users, historyMap),
        config,
        `${options.resume ? "resume" : "run"}:${runId}:profiles`
      )
      : Promise.resolve({ count: 0, taskUids: [], batchUids: [] });
    const chatPromise = rebuildChats
      ? replaceIndexDocuments(
        shadowIndexes.chats,
        buildChatDocuments(chats),
        config,
        `${options.resume ? "resume" : "run"}:${runId}:chats`
      )
      : Promise.resolve({ count: 0, taskUids: [], batchUids: [] });
    const messagePromise = rebuildMessages
      ? streamIndexMessages(userMap, chatMap, options.resume ? "sync" : "replace", config, {
        indexName: shadowIndexes.messages,
        phases: config.reindexPhases,
        customMetadataPrefix: `${options.resume ? "resume" : "run"}:${runId}:messages`,
      })
      : Promise.resolve({ count: 0, taskUids: [], batchUids: [] });

    let messageSummary = await messagePromise;
    let messageStats = rebuildMessages
      ? await getIndexStats(shadowIndexes.messages)
      : { numberOfDocuments: 0 };

    if (rebuildMessages && (messageStats.numberOfDocuments ?? 0) !== messageSummary.count) {
      throw new Error(
        `Message shadow index validation failed: expected ${messageSummary.count}, received ${messageStats.numberOfDocuments ?? 0}`
      );
    }

    let earlyMessageSwapTask: MeilisearchTask | null = null;
    let earlyMessageSwapCompletedTask: MeilisearchTask | null = null;
    const shouldEarlySwapMessage =
      rebuildMessages
      && config.earlyMessageSwap
      && (rebuildProfiles || rebuildChats);

    if (shouldEarlySwapMessage) {
      console.log('[indexer] message shadow index validated; swapping "messages" live early...');
      earlyMessageSwapTask = await swapIndexes([
        { indexes: [SEARCH_INDEXES.messages, shadowIndexes.messages] },
      ]);
      earlyMessageSwapCompletedTask = await waitForTask(
        earlyMessageSwapTask.taskUid,
        INDEX_TASK_TIMEOUT
      );
      await updateSearchIndexRun(runId, {
        indexedCounts: {
          messages: messageSummary.count,
        },
        taskUids: [
          ...(isTrackedSearchTaskId(earlyMessageSwapTask.taskUid) ? [earlyMessageSwapTask.taskUid] : []),
          ...messageSummary.taskUids,
        ],
        batchUids: [
          ...(isTrackedSearchTaskId(earlyMessageSwapCompletedTask.batchUid)
            ? [earlyMessageSwapCompletedTask.batchUid]
            : []),
          ...messageSummary.batchUids,
        ],
        progressSummary: {
          messageSwapEarly: true,
          messagesVisible: true,
        },
      });
    }

    const [profileSummary, chatSummary, profileStats, chatStats] = await Promise.all([
      profilePromise,
      chatPromise,
      rebuildProfiles ? getIndexStats(shadowIndexes.profiles) : Promise.resolve({ numberOfDocuments: 0 }),
      rebuildChats ? getIndexStats(shadowIndexes.chats) : Promise.resolve({ numberOfDocuments: 0 }),
    ]);

    if (rebuildProfiles && (profileStats.numberOfDocuments ?? 0) !== users.length) {
      throw new Error(
        `Profile shadow index validation failed: expected ${users.length}, received ${profileStats.numberOfDocuments ?? 0}`
      );
    }
    if (rebuildChats && (chatStats.numberOfDocuments ?? 0) !== chats.length) {
      throw new Error(
        `Chat shadow index validation failed: expected ${chats.length}, received ${chatStats.numberOfDocuments ?? 0}`
      );
    }
    const allTaskUids = [
      ...profileSummary.taskUids,
      ...chatSummary.taskUids,
      ...messageSummary.taskUids,
    ];
    const allBatchUids = [
      ...profileSummary.batchUids,
      ...chatSummary.batchUids,
      ...messageSummary.batchUids,
    ];
    const progressSummary = await buildBatchProgressSummary(allBatchUids);

    await updateSearchIndexRun(runId, {
      indexedCounts: {
        profiles: profileSummary.count,
        chats: chatSummary.count,
        messages: messageSummary.count,
      },
      taskUids: allTaskUids,
      batchUids: allBatchUids,
      progressSummary: {
        ...progressSummary,
        validation: {
          profiles: rebuildProfiles ? profileStats.numberOfDocuments ?? 0 : null,
          chats: rebuildChats ? chatStats.numberOfDocuments ?? 0 : null,
          messages: rebuildMessages ? messageStats.numberOfDocuments ?? 0 : null,
        },
      },
    });

    const swaps: Array<{ indexes: [string, string] }> = [];
    if (rebuildProfiles) swaps.push({ indexes: [SEARCH_INDEXES.profiles, shadowIndexes.profiles] });
    if (rebuildChats) swaps.push({ indexes: [SEARCH_INDEXES.chats, shadowIndexes.chats] });
    if (rebuildMessages && !shouldEarlySwapMessage) {
      swaps.push({ indexes: [SEARCH_INDEXES.messages, shadowIndexes.messages] });
    }

    let swapTask: MeilisearchTask | null = null;
    let completedSwapTask: MeilisearchTask | null = null;
    if (swaps.length > 0) {
      swapTask = await swapIndexes(swaps);
      completedSwapTask = await waitForTask(swapTask.taskUid, INDEX_TASK_TIMEOUT);
    }

    if (config.autoPruneShadowIndexes) {
      if (getSearchBackend() === "opensearch") {
        const indicesToPrune = collectOpenSearchIndicesToPrune([
          earlyMessageSwapTask,
          swapTask,
        ]);
        await Promise.all(indicesToPrune.map((indexName) => deleteIndex(indexName)));
      } else {
        await Promise.all(
          normalizedScopes.map((scope) => deleteIndex(shadowIndexes[scope]))
        );
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[indexer] === ${startLabel} COMPLETE in ${elapsed}s ===`);

    await markSearchIndexRunSucceeded(runId, {
      taskUids: [
        ...(swapTask && isTrackedSearchTaskId(swapTask.taskUid) ? [swapTask.taskUid] : []),
        ...(earlyMessageSwapTask && isTrackedSearchTaskId(earlyMessageSwapTask.taskUid)
          ? [earlyMessageSwapTask.taskUid]
          : []),
      ],
      batchUids: [
        ...(completedSwapTask && isTrackedSearchTaskId(completedSwapTask.batchUid)
          ? [completedSwapTask.batchUid]
          : []),
        ...(earlyMessageSwapCompletedTask && isTrackedSearchTaskId(earlyMessageSwapCompletedTask.batchUid)
          ? [earlyMessageSwapCompletedTask.batchUid]
          : []),
      ],
      progressSummary: {
        swapped: Boolean(swapTask || earlyMessageSwapTask),
        messageSwapEarly: shouldEarlySwapMessage,
        elapsedSeconds: Number(elapsed),
      },
      metadata: {
        shadowIndexes,
        liveIndexes: SEARCH_INDEXES,
        autoPrunedShadowIndexes: config.autoPruneShadowIndexes,
        scopes: normalizedScopes,
        backend: getSearchBackend(),
        resumed: options.resume ?? false,
      },
    });

    return {
      profiles: rebuildProfiles ? users.length : 0,
      chats: rebuildChats ? chats.length : 0,
      messages: messageSummary.count,
      runId,
      shadowIndexes,
    };
  } catch (error) {
    await markSearchIndexRunFailed(runId, error, {
      metadata: {
        shadowIndexes,
        backend: getSearchBackend(),
        resumed: options.resume ?? false,
      },
    });
    throw error;
  }
}

export async function reindexSearchDocuments(scopes?: SearchIndexScope[]): Promise<ReindexResult> {
  if (!scopes || scopes.length === 0) {
    const resumableRun = await getLatestResumableFullReindex();
    if (resumableRun) {
      console.log(
        `[indexer] reusing resumable full reindex ${resumableRun.id} instead of creating a new shadow run`
      );
      return resumeSearchReindex(resumableRun.id);
    }
  }

  const normalizedScopes = normalizeReindexScopes(scopes);
  const run = await createSearchIndexRun({
    mode: "full_reindex",
    scopes: normalizedScopes,
  });
  const shadowIndexes = createShadowIndexes(run.id);

  return executeFullReindex({
    runId: run.id,
    shadowIndexes,
    scopes: normalizedScopes,
    resume: false,
  });
}

function parseShadowIndexes(value: unknown): SearchIndexMap | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.profiles === "string"
    && typeof candidate.chats === "string"
    && typeof candidate.messages === "string"
    ? {
        profiles: candidate.profiles,
        chats: candidate.chats,
        messages: candidate.messages,
      }
    : null;
}

function deriveResumeScopes(run: SearchIndexRunRecord) {
  const normalizedScopes = normalizeReindexScopes(run.scopes);
  const progressSummary = (run.progress_summary ?? {}) as Record<string, unknown>;
  const messagesAlreadyVisible =
    progressSummary.messagesVisible === true || progressSummary.messageSwapEarly === true;

  if (messagesAlreadyVisible && normalizedScopes.includes("messages")) {
    const nonMessageScopes = normalizedScopes.filter((scope) => scope !== "messages");
    if (nonMessageScopes.length > 0) {
      console.log(
        `[indexer] resume run ${run.id}: messages are already live, continuing with ${nonMessageScopes.join(", ")} only`
      );
      return nonMessageScopes;
    }
  }

  return normalizedScopes;
}

function isCanonicalUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export async function resumeSearchReindex(runId?: string): Promise<ReindexResult> {
  const run = runId
    ? (
      isCanonicalUuid(runId)
        ? (await getSearchIndexRun(runId)) ?? await getSearchIndexRunByShadowHint(runId)
        : await getSearchIndexRunByShadowHint(runId)
    )
    : await getLatestResumableFullReindex();

  if (!run) {
    throw new Error(
      runId
        ? `Search index run not found for resume: ${runId}`
        : "No resumable full reindex run found."
    );
  }

  if (run.mode !== "full_reindex") {
    throw new Error(`Search index run ${run.id} is not a full reindex run.`);
  }

  const shadowIndexes = parseShadowIndexes(run.metadata?.shadowIndexes) ?? createShadowIndexes(run.id);
  if (!parseShadowIndexes(run.metadata?.shadowIndexes)) {
    console.warn(
      `[indexer] resume run ${run.id}: shadow indexes missing from metadata, reconstructing from run id as ` +
      `${shadowIndexes.profiles}, ${shadowIndexes.chats}, ${shadowIndexes.messages}`
    );
  }
  console.log(
    `[indexer] resume run ${run.id}: resolved shadow indexes ${JSON.stringify(shadowIndexes)}`
  );

  const normalizedScopes = deriveResumeScopes(run);
  return executeFullReindex({
    runId: run.id,
    shadowIndexes,
    scopes: normalizedScopes,
    resume: true,
  });
}

export async function legacySyncSearchDocuments(
  scopes?: Array<"profiles" | "chats" | "messages">
) {
  const normalizedScopes: Array<"profiles" | "chats" | "messages"> =
    scopes && scopes.length > 0 ? scopes : ["profiles", "chats", "messages"];

  console.log(`[indexer] === SYNC START (${normalizedScopes.join(", ")}) ===`);
  const startTime = Date.now();
  const config = getIndexerConfig();
  console.log(
    `[indexer] config: batch=${config.batchSize}, uploadConcurrency=${config.uploadConcurrency}, ` +
    `pageSize=${config.cassandraPageSize}, flushMultiplier=${config.flushMultiplier}, ` +
    `chatScanConcurrency=${config.chatScanConcurrency}, userScanConcurrency=${config.userScanConcurrency}, ` +
    `scanMode=${config.messageScanMode}, ` +
    `bucketStart=${config.bucketStartYear}-${String(config.bucketStartMonth).padStart(2, "0")}, ` +
    `messagePhases=${config.syncPhases.join(" -> ")}`
  );

  await configureSearchIndices();

  const needsUsers =
    normalizedScopes.includes("profiles") || normalizedScopes.includes("messages");
  const needsChats =
    normalizedScopes.includes("chats") || normalizedScopes.includes("messages");

  const [users, chats] = await Promise.all([
    needsUsers ? listAllUsers() : Promise.resolve([] as UserRecord[]),
    needsChats ? listAllChats() : Promise.resolve([] as ChatRecord[]),
  ]);

  let profileCount = 0;
  let chatCount = 0;
  let messageCount = 0;

  if (normalizedScopes.includes("profiles")) {
    const userIds = users.map((user) => user.user_id);
    const historyMap =
      userIds.length > 0
        ? await getUserHistoryForBatch(userIds)
        : new Map<string, HistoryRecordLight[]>();
    await syncIndexDocuments(
      SEARCH_INDEXES.profiles,
      buildProfileDocuments(users, historyMap),
      config,
      "legacy-sync:profiles"
    );
    profileCount = users.length;
  }
  if (normalizedScopes.includes("chats")) {
    await syncIndexDocuments(
      SEARCH_INDEXES.chats,
      buildChatDocuments(chats),
      config,
      "legacy-sync:chats"
    );
    chatCount = chats.length;
  }
  if (normalizedScopes.includes("messages")) {
    const userMap = new Map(users.map((user) => [user.user_id, user]));
    const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));
    const messageSummary = await streamIndexMessages(userMap, chatMap, "sync", config, {
      customMetadataPrefix: "legacy-sync:messages",
    });
    messageCount = messageSummary.count;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[indexer] === SYNC COMPLETE in ${elapsed}s ===`);

  return {
    profiles: profileCount,
    chats: chatCount,
    messages: messageCount,
  };
}

export async function syncSearchDocuments(
  scopes?: Array<"profiles" | "chats" | "messages">
) {
  return legacySyncSearchDocuments(scopes);
}
