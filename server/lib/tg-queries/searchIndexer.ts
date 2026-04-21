import {
  SEARCH_INDEXES,
  configureSearchIndices,
  deleteAllDocuments,
  replaceDocuments,
  updateDocuments,
  waitForTask,
} from "./searchIndex";
import { containsLink } from "./searchHelpers";
import { listAllChats, listAllMessages, listAllUsers, getUserHistoryForBatch, type ChatRecord, type MessageRecord, type UserRecord, type HistoryRecordLight } from "./queries";

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

async function replaceIndexDocuments<T extends Record<string, unknown>>(indexName: string, documents: T[], chunkSize = 1000) {
  const deleteTask = await deleteAllDocuments(indexName);
  await waitForTask(deleteTask.taskUid);

  for (const chunk of chunkArray(documents, chunkSize)) {
    const task = await replaceDocuments(indexName, chunk);
    await waitForTask(task.taskUid);
  }
}

async function syncIndexDocuments<T extends Record<string, unknown>>(indexName: string, documents: T[], chunkSize = 1000) {
  for (const chunk of chunkArray(documents, chunkSize)) {
    const task = await updateDocuments(indexName, chunk);
    await waitForTask(task.taskUid);
  }
}

export async function loadSearchSourceData(scopes: Array<"profiles" | "chats" | "messages"> = ["profiles", "chats", "messages"]) {
  const needsProfiles = scopes.includes("profiles");
  const needsChats = scopes.includes("chats");
  const needsMessages = scopes.includes("messages");

  const [users, chats, messages] = await Promise.all([
    needsProfiles ? listAllUsers() : Promise.resolve([] as UserRecord[]),
    needsChats ? listAllChats() : Promise.resolve([] as ChatRecord[]),
    needsMessages ? listAllMessages() : Promise.resolve([] as MessageRecord[]),
  ]);

  const userIds = scopes.includes("profiles") ? users.map(u => u.user_id) : [];
  const historyMap = userIds.length > 0 ? await getUserHistoryForBatch(userIds) : new Map<string, HistoryRecordLight[]>();

  return { users, chats, messages, historyMap };
}

export async function reindexSearchDocuments() {
  await configureSearchIndices();
  const { users, chats, messages, historyMap } = await loadSearchSourceData(["profiles", "chats", "messages"]);

  await replaceIndexDocuments(SEARCH_INDEXES.profiles, buildProfileDocuments(users, historyMap));
  await replaceIndexDocuments(SEARCH_INDEXES.chats, buildChatDocuments(chats));
  await replaceIndexDocuments(SEARCH_INDEXES.messages, buildMessageDocuments(messages, users, chats));

  return {
    profiles: users.length,
    chats: chats.length,
    messages: messages.length,
  };
}

export async function syncSearchDocuments(scopes?: Array<"profiles" | "chats" | "messages">) {
  await configureSearchIndices();
  const normalizedScopes: Array<"profiles" | "chats" | "messages"> =
    scopes && scopes.length > 0 ? scopes : ["profiles", "chats", "messages"];
  const { users, chats, messages, historyMap } = await loadSearchSourceData(normalizedScopes);

  if (normalizedScopes.includes("profiles")) {
    await syncIndexDocuments(SEARCH_INDEXES.profiles, buildProfileDocuments(users, historyMap));
  }
  if (normalizedScopes.includes("chats")) {
    await syncIndexDocuments(SEARCH_INDEXES.chats, buildChatDocuments(chats));
  }
  if (normalizedScopes.includes("messages")) {
    await syncIndexDocuments(SEARCH_INDEXES.messages, buildMessageDocuments(messages, users, chats));
  }

  return {
    profiles: normalizedScopes.includes("profiles") ? users.length : 0,
    chats: normalizedScopes.includes("chats") ? chats.length : 0,
    messages: normalizedScopes.includes("messages") ? messages.length : 0,
  };
}
