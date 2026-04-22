import {
  SEARCH_INDEXES,
  configureSearchIndices,
  deleteAllDocuments,
  replaceDocuments,
  updateDocuments,
  waitForTask,
} from "./searchIndex";
import { containsLink } from "./searchHelpers";
import {
  listAllChats,
  listAllMessages,
  listAllUsers,
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
const DEFAULT_UPLOAD_CONCURRENCY = 8;
const DEFAULT_CASSANDRA_PAGE_SIZE = 10000;
const DEFAULT_FLUSH_MULTIPLIER = 4;
const DEFAULT_CHAT_SCAN_CONCURRENCY = 4;
const DEFAULT_USER_SCAN_CONCURRENCY = 4;
const DEFAULT_BUCKET_START_YEAR = 2013;
const DEFAULT_BUCKET_START_MONTH = 1;
const DEFAULT_MESSAGE_SCAN_MODE = "table_scan";
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
  hasMedia: boolean | null;
  containsLinks: boolean | null;
  contentLength: number;
  bucket: string | null;
  timestamp: string | null;
  timestampMs: number | null;
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
  const fieldRecords = records.filter(r => r.field === field);
  if (fieldRecords.length === 0) return null;
  fieldRecords.sort((a, b) => {
    const dateA = a.changed_at instanceof Date ? a.changed_at : new Date(a.changed_at);
    const dateB = b.changed_at instanceof Date ? b.changed_at : new Date(b.changed_at);
    return dateB.getTime() - dateA.getTime();
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
    .filter((value): value is MessagePhase =>
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
    uploadConcurrency: readPositiveIntEnv("SEARCH_INDEX_UPLOAD_CONCURRENCY", DEFAULT_UPLOAD_CONCURRENCY),
    cassandraPageSize: readPositiveIntEnv("SEARCH_INDEX_CASSANDRA_PAGE_SIZE", DEFAULT_CASSANDRA_PAGE_SIZE),
    flushMultiplier: readPositiveIntEnv("SEARCH_INDEX_FLUSH_MULTIPLIER", DEFAULT_FLUSH_MULTIPLIER),
    chatScanConcurrency: readPositiveIntEnv("SEARCH_INDEX_CHAT_SCAN_CONCURRENCY", DEFAULT_CHAT_SCAN_CONCURRENCY),
    userScanConcurrency: readPositiveIntEnv("SEARCH_INDEX_USER_SCAN_CONCURRENCY", DEFAULT_USER_SCAN_CONCURRENCY),
    bucketStartYear: readPositiveIntEnv("SEARCH_INDEX_BUCKET_START_YEAR", DEFAULT_BUCKET_START_YEAR),
    bucketStartMonth: Math.min(
      12,
      Math.max(1, readPositiveIntEnv("SEARCH_INDEX_BUCKET_START_MONTH", DEFAULT_BUCKET_START_MONTH))
    ),
    messageScanMode: parseMessageScanMode("SEARCH_INDEX_MESSAGE_SCAN_MODE", DEFAULT_MESSAGE_SCAN_MODE),
    reindexPhases: ensureRequiredMessagePhases(
      parseMessagePhases(
        "SEARCH_INDEX_REINDEX_PHASES",
        ["messages_by_chat", "messages_by_user", "messages_by_id"]
      ),
      ["messages_by_chat", "messages_by_user", "messages_by_id"]
    ),
    syncPhases: ensureRequiredMessagePhases(
      parseMessagePhases(
        "SEARCH_INDEX_SYNC_PHASES",
        ["messages_by_chat", "messages_by_user", "messages_by_id"]
      ),
      ["messages_by_chat", "messages_by_user", "messages_by_id"]
    ),
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
        running++;
        fn(items[idx], idx)
          .then(() => {
            running--;
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

export function buildProfileDocuments(users: UserRecord[], historyMap?: Map<string, HistoryRecordLight[]>): ProfileDocument[] {
  return users.map((user) => {
    const historyRecords = historyMap?.get(user.user_id) || [];
    const historyDisplayName = getLatestHistoryValue(historyRecords, "display_name");
    const historyBio = getLatestHistoryValue(historyRecords, "bio");
    const historyUsernames = getLatestHistoryValue(historyRecords, "usernames");
    let effectiveUsername = user.username ?? null;
    if (!effectiveUsername && historyUsernames) {
      try {
        const usernamesArr = JSON.parse(historyUsernames);
        effectiveUsername = Array.isArray(usernamesArr) ? usernamesArr[usernamesArr.length - 1] : usernamesArr;
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
      hasMedia: message.has_media ?? Boolean(message.media_type || message.media_url),
      containsLinks: containsLink(content),
      contentLength: content.length,
      bucket: message.bucket ?? formatMessageBucket(message.timestamp ?? message.created_at),
      timestamp: toIsoString(message.timestamp ?? message.created_at),
      timestampMs: toTimestampMs(message.timestamp ?? message.created_at),
    };
  });
}

export function buildMessageDocuments(messages: MessageRecord[], users: UserRecord[], chats: ChatRecord[]): MessageDocument[] {
  const userMap = new Map(users.map((user) => [user.user_id, user]));
  const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));
  return buildMessageDocumentsFromMaps(messages, userMap, chatMap);
}

/**
 * Upload document chunks to Meilisearch with bounded parallelism so we keep
 * throughput high without opening an unbounded number of tasks.
 */
async function uploadDocumentsConcurrently<T extends Record<string, unknown>>(
  indexName: string,
  documents: T[],
  uploadFn: typeof replaceDocuments | typeof updateDocuments,
  config: IndexerConfig
) {
  const chunks = chunkArray(documents, config.batchSize);
  console.log(
    `[indexer] uploading ${documents.length} docs to "${indexName}" in ${chunks.length} batches ` +
    `(concurrency: ${config.uploadConcurrency})...`
  );

  let completed = 0;
  await runWithConcurrency(chunks, config.uploadConcurrency, async (chunk, idx) => {
    const task = await uploadFn(indexName, chunk);
    await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    completed += chunk.length;
    if (completed % 50000 < config.batchSize || idx === chunks.length - 1) {
      console.log(`[indexer] "${indexName}": ${completed}/${documents.length} docs`);
    }
  });
}

async function replaceIndexDocuments<T extends Record<string, unknown>>(
  indexName: string,
  documents: T[],
  config: IndexerConfig
) {
  console.log(`[indexer] replacing ${documents.length} documents in "${indexName}"...`);
  const deleteTask = await deleteAllDocuments(indexName);
  await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);
  await uploadDocumentsConcurrently(indexName, documents, replaceDocuments, config);
}

async function syncIndexDocuments<T extends Record<string, unknown>>(
  indexName: string,
  documents: T[],
  config: IndexerConfig
) {
  console.log(`[indexer] syncing ${documents.length} documents into "${indexName}"...`);
  await uploadDocumentsConcurrently(indexName, documents, updateDocuments, config);
}

function getMessagePhases(mode: "replace" | "sync", config: IndexerConfig): MessagePhase[] {
  return mode === "replace" ? config.reindexPhases : config.syncPhases;
}

async function streamIndexMessages(
  userMap: Map<string, UserRecord>,
  chatMap: Map<string, ChatRecord>,
  mode: "replace" | "sync",
  config: IndexerConfig
) {
  if (mode === "replace") {
    console.log(`[indexer] clearing messages index before streaming...`);
    const deleteTask = await deleteAllDocuments(SEARCH_INDEXES.messages);
    await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);
  }

  let totalIndexed = 0;
  let pendingDocs: MessageDocument[] = [];
  const uploadFn = mode === "replace" ? replaceDocuments : updateDocuments;
  const phases = getMessagePhases(mode, config);

  // Track seen messages to deduplicate across tables
  const seen = new Set<string>();

  // Buffer multiple Cassandra pages, then flush in 5k batches
  const flushThreshold = config.batchSize * config.flushMultiplier;

  async function flush() {
    if (pendingDocs.length === 0) return;
    const toUpload = pendingDocs;
    pendingDocs = [];

    const chunks = chunkArray(toUpload, config.batchSize);
    await runWithConcurrency(chunks, config.uploadConcurrency, async (chunk) => {
      const task = await uploadFn(SEARCH_INDEXES.messages, chunk);
      await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    });

    totalIndexed += toUpload.length;
    console.log(`[indexer] messages: ${totalIndexed} indexed (${seen.size} unique seen)...`);
  }

  function deduplicateAndBuild(messagePage: MessageRecord[]): MessageDocument[] {
    const newMessages = messagePage.filter(m => {
      const key = `${m.chat_id}:${m.message_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (newMessages.length === 0) return [];
    return buildMessageDocumentsFromMaps(newMessages, userMap, chatMap);
  }

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const phase = phases[phaseIndex];
    const phaseLabel = `phase ${phaseIndex + 1}/${phases.length}`;
    const phaseStartCount = totalIndexed;

    if (phase === "messages_by_chat") {
      if (config.messageScanMode === "table_scan") {
        console.log(`[indexer] ${phaseLabel}: streaming messages_by_chat (full table scan)...`);
        for await (const messagePage of streamAllMessagesFromChatTable(config.cassandraPageSize)) {
          if (messagePage.length === 0) continue;
          const documents = deduplicateAndBuild(messagePage);
          if (documents.length > 0) pendingDocs.push(...documents);
          if (pendingDocs.length >= flushThreshold) await flush();
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
          if (messagePage.length === 0) continue;
          const documents = deduplicateAndBuild(messagePage);
          if (documents.length > 0) pendingDocs.push(...documents);
          if (pendingDocs.length >= flushThreshold) await flush();
        }
      }
    } else if (phase === "messages_by_user") {
      if (config.messageScanMode === "table_scan") {
        console.log(`[indexer] ${phaseLabel}: streaming messages_by_user (full table scan)...`);
        for await (const messagePage of streamAllMessagesFromUserTable(config.cassandraPageSize)) {
          if (messagePage.length === 0) continue;
          const documents = deduplicateAndBuild(messagePage);
          if (documents.length > 0) pendingDocs.push(...documents);
          if (pendingDocs.length >= flushThreshold) await flush();
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
          if (messagePage.length === 0) continue;
          const documents = deduplicateAndBuild(messagePage);
          if (documents.length > 0) pendingDocs.push(...documents);
          if (pendingDocs.length >= flushThreshold) await flush();
        }
      }
    } else {
      console.log(`[indexer] ${phaseLabel}: streaming messages_by_id...`);
      for await (const messagePage of streamAllMessages(config.cassandraPageSize)) {
        if (messagePage.length === 0) continue;
        const documents = deduplicateAndBuild(messagePage);
        if (documents.length > 0) pendingDocs.push(...documents);
        if (pendingDocs.length >= flushThreshold) await flush();
      }
    }

    await flush();
    if ((phase === "messages_by_chat" || phase === "messages_by_user") && totalIndexed === phaseStartCount) {
      const scanHint = config.messageScanMode === "partition_scan"
        ? `This usually means the configured bucket scan range does not match the Cassandra data. Current bucketStart=${config.bucketStartYear}-${String(config.bucketStartMonth).padStart(2, "0")}.`
        : "This usually means the source table is empty or Cassandra returned no rows for the full table scan.";
      console.warn(
        `[indexer] ${phase} returned 0 messages. ${scanHint}`
      );
    }
    console.log(`[indexer] ${phaseLabel} complete: +${totalIndexed - phaseStartCount} new from ${phase}`);
  }

  console.log(`[indexer] messages: ALL PHASES DONE — ${totalIndexed} total documents indexed (${seen.size} unique messages)`);
  return totalIndexed;
}

export async function loadSearchSourceData(scopes: Array<"profiles" | "chats" | "messages"> = ["profiles", "chats", "messages"]) {
  const needsProfiles = scopes.includes("profiles");
  const needsChats = scopes.includes("chats");
  const needsMessages = scopes.includes("messages");

  console.log(`[indexer] loading source data for scopes: ${scopes.join(", ")}...`);

  const [users, chats, messages] = await Promise.all([
    needsProfiles || needsMessages ? listAllUsers() : Promise.resolve([] as UserRecord[]),
    needsChats || needsMessages ? listAllChats() : Promise.resolve([] as ChatRecord[]),
    needsMessages ? listAllMessages() : Promise.resolve([] as MessageRecord[]),
  ]);

  console.log(`[indexer] loaded: ${users.length} users, ${chats.length} chats, ${messages.length} messages`);

  const userIds = needsProfiles ? users.map(u => u.user_id) : [];
  const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();

  return { users, chats, messages, historyMap };
}

export async function reindexSearchDocuments() {
  console.log("[indexer] === FULL REINDEX START ===");
  const startTime = Date.now();
  const config = getIndexerConfig();
  console.log(
    `[indexer] config: batch=${config.batchSize}, uploadConcurrency=${config.uploadConcurrency}, ` +
    `pageSize=${config.cassandraPageSize}, flushMultiplier=${config.flushMultiplier}, ` +
    `chatScanConcurrency=${config.chatScanConcurrency}, userScanConcurrency=${config.userScanConcurrency}, ` +
    `scanMode=${config.messageScanMode}, ` +
    `bucketStart=${config.bucketStartYear}-${String(config.bucketStartMonth).padStart(2, "0")}, ` +
    `messagePhases=${config.reindexPhases.join(" -> ")}`
  );

  await configureSearchIndices();

  // Load all reference data from Cassandra in parallel
  console.log("[indexer] loading users and chats from Cassandra (parallel)...");
  const [users, chats] = await Promise.all([listAllUsers(), listAllChats()]);
  console.log(`[indexer] loaded ${users.length} users, ${chats.length} chats`);

  const userIds = users.map(u => u.user_id);
  const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();
  console.log(`[indexer] loaded history for ${historyMap.size} users`);

  const userMap = new Map(users.map(u => [u.user_id, u]));
  const chatMap = new Map(chats.map(c => [c.chat_id, c]));

  // Index all three types in parallel — each one clears its own index independently
  console.log("[indexer] indexing profiles, chats, and messages in parallel...");
  const [,, messageCount] = await Promise.all([
    replaceIndexDocuments(SEARCH_INDEXES.profiles, buildProfileDocuments(users, historyMap), config),
    replaceIndexDocuments(SEARCH_INDEXES.chats, buildChatDocuments(chats), config),
    streamIndexMessages(userMap, chatMap, "replace", config),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[indexer] === FULL REINDEX COMPLETE in ${elapsed}s ===`);

  return {
    profiles: users.length,
    chats: chats.length,
    messages: messageCount as number,
  };
}

export async function syncSearchDocuments(scopes?: Array<"profiles" | "chats" | "messages">) {
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

  // Always load users + chats if messages are in scope (needed for enrichment)
  const needsUsers = normalizedScopes.includes("profiles") || normalizedScopes.includes("messages");
  const needsChats = normalizedScopes.includes("chats") || normalizedScopes.includes("messages");

  const [users, chats] = await Promise.all([
    needsUsers ? listAllUsers() : Promise.resolve([] as UserRecord[]),
    needsChats ? listAllChats() : Promise.resolve([] as ChatRecord[]),
  ]);

  let profileCount = 0;
  let chatCount = 0;
  let messageCount = 0;

  if (normalizedScopes.includes("profiles")) {
    const userIds = users.map(u => u.user_id);
    const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();
    await syncIndexDocuments(SEARCH_INDEXES.profiles, buildProfileDocuments(users, historyMap), config);
    profileCount = users.length;
  }
  if (normalizedScopes.includes("chats")) {
    await syncIndexDocuments(SEARCH_INDEXES.chats, buildChatDocuments(chats), config);
    chatCount = chats.length;
  }
  if (normalizedScopes.includes("messages")) {
    const userMap = new Map(users.map(u => [u.user_id, u]));
    const chatMap = new Map(chats.map(c => [c.chat_id, c]));
    messageCount = await streamIndexMessages(userMap, chatMap, "sync", config);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[indexer] === SYNC COMPLETE in ${elapsed}s ===`);

  return {
    profiles: profileCount,
    chats: chatCount,
    messages: messageCount,
  };
}
