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
  getUserHistoryForBatch,
  type ChatRecord,
  type MessageRecord,
  type UserRecord,
  type HistoryRecordLight,
} from "./queries";

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

export function buildMessageDocuments(messages: MessageRecord[], users: UserRecord[], chats: ChatRecord[]): MessageDocument[] {
  const userMap = new Map(users.map((user) => [user.user_id, user]));
  const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));

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

// Increased timeout (10 min) for large batch indexing operations
const INDEX_TASK_TIMEOUT = 600_000;

async function replaceIndexDocuments<T extends Record<string, unknown>>(indexName: string, documents: T[], chunkSize = 1000) {
  console.log(`[indexer] replacing ${documents.length} documents in "${indexName}"...`);
  const deleteTask = await deleteAllDocuments(indexName);
  await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);

  let indexed = 0;
  for (const chunk of chunkArray(documents, chunkSize)) {
    const task = await replaceDocuments(indexName, chunk);
    await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    indexed += chunk.length;
    if (indexed % 5000 === 0 || indexed === documents.length) {
      console.log(`[indexer] "${indexName}": ${indexed}/${documents.length} documents indexed`);
    }
  }
}

async function syncIndexDocuments<T extends Record<string, unknown>>(indexName: string, documents: T[], chunkSize = 1000) {
  console.log(`[indexer] syncing ${documents.length} documents into "${indexName}"...`);
  let indexed = 0;
  for (const chunk of chunkArray(documents, chunkSize)) {
    const task = await updateDocuments(indexName, chunk);
    await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    indexed += chunk.length;
    if (indexed % 5000 === 0 || indexed === documents.length) {
      console.log(`[indexer] "${indexName}": ${indexed}/${documents.length} documents synced`);
    }
  }
}

/**
 * Stream messages from Cassandra and index them in batches to avoid OOM.
 * Uses the streamAllMessages generator which yields one page at a time.
 */
async function streamIndexMessages(
  userMap: Map<string, UserRecord>,
  chatMap: Map<string, ChatRecord>,
  mode: "replace" | "sync"
) {
  if (mode === "replace") {
    console.log(`[indexer] clearing messages index before streaming...`);
    const deleteTask = await deleteAllDocuments(SEARCH_INDEXES.messages);
    await waitForTask(deleteTask.taskUid, INDEX_TASK_TIMEOUT);
  }

  let totalIndexed = 0;
  const usersArray = Array.from(userMap.values());
  const chatsArray = Array.from(chatMap.values());

  for await (const messagePage of streamAllMessages(5000)) {
    if (messagePage.length === 0) continue;

    const documents = buildMessageDocuments(messagePage, usersArray, chatsArray);

    // Use PUT for replace mode (first batch after delete), POST for sync/subsequent
    for (const chunk of chunkArray(documents, 1000)) {
      const task = mode === "replace"
        ? await replaceDocuments(SEARCH_INDEXES.messages, chunk)
        : await updateDocuments(SEARCH_INDEXES.messages, chunk);
      await waitForTask(task.taskUid, INDEX_TASK_TIMEOUT);
    }

    totalIndexed += messagePage.length;
    console.log(`[indexer] messages: ${totalIndexed} documents indexed so far...`);
  }

  console.log(`[indexer] messages: completed — ${totalIndexed} total documents indexed`);
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

  await configureSearchIndices();

  // Load users and chats (needed as lookup maps for message enrichment)
  console.log("[indexer] loading users and chats from Cassandra...");
  const [users, chats] = await Promise.all([listAllUsers(), listAllChats()]);
  console.log(`[indexer] loaded ${users.length} users, ${chats.length} chats`);

  // Build user history for profile enrichment
  const userIds = users.map(u => u.user_id);
  const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();
  console.log(`[indexer] loaded history for ${historyMap.size} users`);

  // Index profiles
  await replaceIndexDocuments(SEARCH_INDEXES.profiles, buildProfileDocuments(users, historyMap));

  // Index chats
  await replaceIndexDocuments(SEARCH_INDEXES.chats, buildChatDocuments(chats));

  // Index messages via streaming to avoid OOM
  const userMap = new Map(users.map(u => [u.user_id, u]));
  const chatMap = new Map(chats.map(c => [c.chat_id, c]));
  const messageCount = await streamIndexMessages(userMap, chatMap, "replace");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[indexer] === FULL REINDEX COMPLETE in ${elapsed}s ===`);

  return {
    profiles: users.length,
    chats: chats.length,
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

  let profileCount = 0;
  let chatCount = 0;
  let messageCount = 0;

  if (normalizedScopes.includes("profiles")) {
    const userIds = users.map(u => u.user_id);
    const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();
    await syncIndexDocuments(SEARCH_INDEXES.profiles, buildProfileDocuments(users, historyMap));
    profileCount = users.length;
  }

  if (normalizedScopes.includes("chats")) {
    await syncIndexDocuments(SEARCH_INDEXES.chats, buildChatDocuments(chats));
    chatCount = chats.length;
  }

  if (normalizedScopes.includes("messages")) {
    const userMap = new Map(users.map(u => [u.user_id, u]));
    const chatMap = new Map(chats.map(c => [c.chat_id, c]));
    messageCount = await streamIndexMessages(userMap, chatMap, "sync");
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[indexer] === SYNC COMPLETE in ${elapsed}s ===`);

  return {
    profiles: profileCount,
    chats: chatCount,
    messages: messageCount,
  };
}
