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
  listAllUsers,
  streamAllMessages,
  getUserHistoryForBatch,
  type ChatRecord,
  type MessageRecord,
  type UserRecord,
  type HistoryRecordLight,
} from "./queries";

// ── Concurrency tuning ──────────────────────────────────────────────────
// How many Meilisearch upload batches to fire concurrently.
// Meilisearch queues tasks internally, so we can enqueue fast and let it process.
const UPLOAD_CONCURRENCY = 8;

// Documents per Meilisearch batch — larger = fewer HTTP round-trips
const BATCH_SIZE = 5000;

// Cassandra page size for streaming reads
const CASSANDRA_PAGE_SIZE = 10000;

// Task timeout (10 min)
const INDEX_TASK_TIMEOUT = 600_000;

// ── Document types ──────────────────────────────────────────────────────

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
  timestamp: string | null;
  timestampMs: number | null;
};

// ── Helpers ─────────────────────────────────────────────────────────────

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

/**
 * Run async tasks with bounded concurrency.
 * Fires up to `concurrency` tasks at a time, waits for a slot to free up before starting more.
 */
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
      if (items.length === 0) resolve();
    }
    tryNext();
  });
}

// ── Document builders ───────────────────────────────────────────────────

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
      timestamp: toIsoString(message.timestamp ?? message.created_at),
      timestampMs: toTimestampMs(message.timestamp ?? message.created_at),
    };
  });
}

// Keep the old signature for backward compat
export function buildMessageDocuments(messages: MessageRecord[], users: UserRecord[], chats: ChatRecord[]): MessageDocument[] {
  const userMap = new Map(users.map((user) => [user.user_id, user]));
  const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));
  return buildMessageDocumentsFromMaps(messages, userMap, chatMap);
}

// ── Concurrent index uploaders ──────────────────────────────────────────

/**
 * Upload documents to Meilisearch with concurrent batch uploads.
 * Instead of waiting for each batch to complete, fires UPLOAD_CONCURRENCY
 * batches in parallel. Meilisearch queues them internally.
 */
async function uploadDocumentsConcurrently<T extends Record<string, unknown>>(
  indexName: string,
  documents: T[],
  mode: "replace" | "sync",
  batchSize = BATCH_SIZE
) {
  const chunks = chunkArray(documents, batchSize);
  console.log(`[indexer] uploading ${documents.length} docs to "${indexName}" in ${chunks.length} batches (concurrency: ${UPLOAD_CONCURRENCY})...`);

  let completed = 0;
  const uploadFn = mode === "replace" ? replaceDocuments : updateDocuments;

  await runWithConcurrency(chunks, UPLOAD_CONCURRENCY, async (chunk, idx) => {
    const task = await uploadFn(indexName, chunk);
    await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    completed += chunk.length;
    // Log every ~20k docs or on the last batch
    if (completed % 20000 < batchSize || idx === chunks.length - 1) {
      console.log(`[indexer] "${indexName}": ${completed}/${documents.length} docs uploaded`);
    }
  });
}

/**
 * Replace all documents in an index (clear + concurrent upload).
 */
async function replaceIndexDocuments<T extends Record<string, unknown>>(indexName: string, documents: T[]) {
  console.log(`[indexer] clearing "${indexName}" index...`);
  const deleteTask = await deleteAllDocuments(indexName);
  await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);
  await uploadDocumentsConcurrently(indexName, documents, "replace");
}

/**
 * Sync (upsert) documents into an index concurrently.
 */
async function syncIndexDocuments<T extends Record<string, unknown>>(indexName: string, documents: T[]) {
  await uploadDocumentsConcurrently(indexName, documents, "sync");
}

/**
 * Stream messages from Cassandra and index them with concurrent Meilisearch uploads.
 * - Reads Cassandra pages sequentially (driver limitation)
 * - Accumulates a buffer of pages, then fires concurrent uploads for the buffer
 * - This pipelines Cassandra I/O with Meilisearch I/O
 */
async function streamIndexMessages(
  userMap: Map<string, UserRecord>,
  chatMap: Map<string, ChatRecord>,
  mode: "replace" | "sync"
) {
  if (mode === "replace") {
    console.log(`[indexer] clearing messages index...`);
    const deleteTask = await deleteAllDocuments(SEARCH_INDEXES.messages);
    await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);
  }

  let totalIndexed = 0;
  let pendingDocs: MessageDocument[] = [];

  // Flush threshold: accumulate docs then fire concurrent uploads
  const FLUSH_THRESHOLD = BATCH_SIZE * UPLOAD_CONCURRENCY; // e.g. 5000 * 8 = 40000 docs

  const uploadFn = mode === "replace" ? replaceDocuments : updateDocuments;

  async function flush() {
    if (pendingDocs.length === 0) return;

    const toUpload = pendingDocs;
    pendingDocs = [];

    const chunks = chunkArray(toUpload, BATCH_SIZE);
    await runWithConcurrency(chunks, UPLOAD_CONCURRENCY, async (chunk) => {
      const task = await uploadFn(SEARCH_INDEXES.messages, chunk);
      await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    });

    totalIndexed += toUpload.length;
    console.log(`[indexer] messages: ${totalIndexed} docs indexed...`);
  }

  for await (const messagePage of streamAllMessages(CASSANDRA_PAGE_SIZE)) {
    if (messagePage.length === 0) continue;

    const documents = buildMessageDocumentsFromMaps(messagePage, userMap, chatMap);
    pendingDocs.push(...documents);

    // Flush when buffer is full
    if (pendingDocs.length >= FLUSH_THRESHOLD) {
      await flush();
    }
  }

  // Flush remaining
  await flush();

  console.log(`[indexer] messages: completed — ${totalIndexed} total documents`);
  return totalIndexed;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function loadSearchSourceData(scopes: Array<"profiles" | "chats" | "messages"> = ["profiles", "chats", "messages"]) {
  const needsProfiles = scopes.includes("profiles");
  const needsChats = scopes.includes("chats");
  const needsMessages = scopes.includes("messages");

  console.log(`[indexer] loading source data for scopes: ${scopes.join(", ")}...`);

  const [users, chats] = await Promise.all([
    needsProfiles || needsMessages ? listAllUsers() : Promise.resolve([] as UserRecord[]),
    needsChats || needsMessages ? listAllChats() : Promise.resolve([] as ChatRecord[]),
  ]);

  console.log(`[indexer] loaded: ${users.length} users, ${chats.length} chats`);

  const userIds = needsProfiles ? users.map(u => u.user_id) : [];
  const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();

  return { users, chats, historyMap };
}

export async function reindexSearchDocuments() {
  console.log("[indexer] === FULL REINDEX START ===");
  const startTime = Date.now();

  await configureSearchIndices();

  // ── Phase 1: Load reference data from Cassandra (parallel reads) ──
  console.log("[indexer] Phase 1: Loading users and chats from Cassandra (parallel)...");
  const loadStart = Date.now();
  const [users, chats] = await Promise.all([listAllUsers(), listAllChats()]);
  console.log(`[indexer] loaded ${users.length} users, ${chats.length} chats in ${((Date.now() - loadStart) / 1000).toFixed(1)}s`);

  // Build lookup maps (used by both profile indexing and message enrichment)
  const userMap = new Map(users.map(u => [u.user_id, u]));
  const chatMap = new Map(chats.map(c => [c.chat_id, c]));

  // ── Phase 2: Build profile history ──
  console.log("[indexer] Phase 2: Loading user history...");
  const userIds = users.map(u => u.user_id);
  const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();
  console.log(`[indexer] loaded history for ${historyMap.size} users`);

  // ── Phase 3: Index all three types in parallel ──
  // Profiles and chats are fully loaded, so we can index them concurrently with streaming messages
  console.log("[indexer] Phase 3: Indexing profiles, chats, and messages (parallel)...");
  const indexStart = Date.now();

  const [profileResult, chatResult, messageCount] = await Promise.all([
    // Profiles: clear + concurrent upload
    (async () => {
      const docs = buildProfileDocuments(users, historyMap);
      await replaceIndexDocuments(SEARCH_INDEXES.profiles, docs);
      return docs.length;
    })(),

    // Chats: clear + concurrent upload
    (async () => {
      const docs = buildChatDocuments(chats);
      await replaceIndexDocuments(SEARCH_INDEXES.chats, docs);
      return docs.length;
    })(),

    // Messages: stream from Cassandra + concurrent upload
    streamIndexMessages(userMap, chatMap, "replace"),
  ]);

  const indexElapsed = ((Date.now() - indexStart) / 1000).toFixed(1);
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`[indexer] indexing phase took ${indexElapsed}s`);
  console.log(`[indexer] === FULL REINDEX COMPLETE in ${totalElapsed}s ===`);

  return {
    profiles: profileResult,
    chats: chatResult,
    messages: messageCount,
  };
}

export async function syncSearchDocuments(scopes?: Array<"profiles" | "chats" | "messages">) {
  const normalizedScopes: Array<"profiles" | "chats" | "messages"> =
    scopes && scopes.length > 0 ? scopes : ["profiles", "chats", "messages"];

  console.log(`[indexer] === SYNC START (${normalizedScopes.join(", ")}) ===`);
  const startTime = Date.now();

  await configureSearchIndices();

  // Always load users + chats if messages are in scope (needed for enrichment)
  const needsUsers = normalizedScopes.includes("profiles") || normalizedScopes.includes("messages");
  const needsChats = normalizedScopes.includes("chats") || normalizedScopes.includes("messages");

  const [users, chats] = await Promise.all([
    needsUsers ? listAllUsers() : Promise.resolve([] as UserRecord[]),
    needsChats ? listAllChats() : Promise.resolve([] as ChatRecord[]),
  ]);

  const syncTasks: Promise<void>[] = [];
  let profileCount = 0;
  let chatCount = 0;
  let messageCount = 0;

  // Fire all sync operations in parallel
  if (normalizedScopes.includes("profiles")) {
    syncTasks.push((async () => {
      const userIds = users.map(u => u.user_id);
      const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();
      const docs = buildProfileDocuments(users, historyMap);
      await syncIndexDocuments(SEARCH_INDEXES.profiles, docs);
      profileCount = docs.length;
    })());
  }

  if (normalizedScopes.includes("chats")) {
    syncTasks.push((async () => {
      const docs = buildChatDocuments(chats);
      await syncIndexDocuments(SEARCH_INDEXES.chats, docs);
      chatCount = docs.length;
    })());
  }

  if (normalizedScopes.includes("messages")) {
    syncTasks.push((async () => {
      const userMap = new Map(users.map(u => [u.user_id, u]));
      const chatMap = new Map(chats.map(c => [c.chat_id, c]));
      messageCount = await streamIndexMessages(userMap, chatMap, "sync");
    })());
  }

  await Promise.all(syncTasks);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[indexer] === SYNC COMPLETE in ${elapsed}s ===`);

  return {
    profiles: profileCount,
    chats: chatCount,
    messages: messageCount,
  };
}
