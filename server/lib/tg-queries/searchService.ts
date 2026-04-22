import { sql } from "../db";
import type {
  ChannelResult,
  GroupResult,
  MessageResult,
  ProfileResult,
  SearchResult,
  UnifiedSearchResponse,
} from "../../../shared/api";
import { toApiServedAssetUrl } from "./storageAssets";
import {
  getChatById,
  getMessageByChatBucketTimestamp,
  getMessageById,
  getUserById,
  getUserByUsername,
  getUserHistoryForBatch,
  listChatsByIds,
  formatMessageBucket,
} from "./queries";
import { hashPhoneNumber } from "./phone";
import {
  classifyQuery,
  cleanSearchValue,
  confidenceFromScore,
  containsLink,
  highlightSnippet,
  isTelegramId,
  normalizeHandle,
  snippetFromText,
} from "./searchHelpers";
import { SEARCH_INDEXES, searchIndex } from "./searchIndex";
import {
  applyResolvedRedaction,
  buildRedactionMetadata,
  loadRedactionMap,
  type ResolvedRedaction,
} from "./redactions";
import type {
  ChannelSearchInput,
  GroupSearchInput,
  MessageSearchInput,
  ProfileSearchInput,
  UnifiedSearchInput,
} from "./searchSchemas";
import type { ViewerAccess } from "./viewer";

export type {
  ChannelSearchInput,
  GroupSearchInput,
  MessageSearchInput,
  ProfileSearchInput,
  UnifiedSearchInput,
} from "./searchSchemas";

type SearchContext = {
  viewer: ViewerAccess;
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

type SearchResultPage<T extends SearchResult> = {
  results: T[];
  total: number;
};

function escapeFilterValue(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function serializeDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function numericDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime();
}

function parseLookupTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildMessageContextLink(
  chatId: string,
  messageId: string,
  bucket?: string | null,
  timestamp?: string | null
) {
  const params = new URLSearchParams();
  if (bucket) {
    params.set("bucket", bucket);
  }
  if (timestamp) {
    params.set("timestamp", timestamp);
  }

  const query = params.toString();
  return query
    ? `/lookup/message/${chatId}/${messageId}?${query}`
    : `/lookup/message/${chatId}/${messageId}`;
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function baseScore(rawScore: number | undefined) {
  if (typeof rawScore !== "number" || Number.isNaN(rawScore)) {
    return 45;
  }

  return Math.max(1, Math.min(100, Math.round(rawScore * 100)));
}

function textIncludes(value: string | null | undefined, input: string | undefined) {
  if (!value || !input) {
    return false;
  }

  return value.toLowerCase().includes(input.toLowerCase());
}

function textEquals(value: string | null | undefined, input: string | undefined) {
  if (!value || !input) {
    return false;
  }

  return value.toLowerCase() === input.toLowerCase();
}

function createRelevance(rawScore: number | undefined, reasons: string[]) {
  const score = baseScore(rawScore);
  return {
    score,
    confidence: confidenceFromScore(score),
    reasons,
  };
}

async function loadTrackingStatusMap(viewerUserId: string, userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) {
    return new Map<string, string>();
  }

  const rows = await sql<{ profile_user_id: string; status: string }[]>`
    SELECT profile_user_id, status
    FROM profile_tracking
    WHERE user_id = ${viewerUserId}
      AND profile_user_id IN ${sql(ids)}
  `;

  return new Map(rows.map((row) => [row.profile_user_id, row.status]));
}

function filterProfileDocument(document: ProfileDocument, input: ProfileSearchInput) {
  const filters = input.filters;
  if (filters.username && !textIncludes(document.username, normalizeHandle(filters.username))) {
    return false;
  }
  if (filters.displayName && !textIncludes(document.displayName, filters.displayName)) {
    return false;
  }
  if (filters.bio && !textIncludes(document.bio, filters.bio)) {
    return false;
  }
  if (filters.userId && document.userId !== filters.userId) {
    return false;
  }
  if (filters.phone) {
    const phoneHash = hashPhoneNumber(filters.phone);
    if (!phoneHash || document.phoneHash !== phoneHash) {
      return false;
    }
  }
  return true;
}

function filterChatDocument(document: ChatDocument, input: ChannelSearchInput | GroupSearchInput) {
  const filters = input.filters;
  if ("channelId" in filters && filters.channelId && document.chatId !== filters.channelId) {
    return false;
  }
  if ("chatId" in filters && filters.chatId && document.chatId !== filters.chatId) {
    return false;
  }
  if (filters.username && !textIncludes(document.username, normalizeHandle(filters.username))) {
    return false;
  }
  if ("displayName" in filters && filters.displayName && !textIncludes(document.title, filters.displayName)) {
    return false;
  }
  if ("title" in filters && filters.title && !textIncludes(document.title, filters.title)) {
    return false;
  }
  if (filters.description && !textIncludes(document.description, filters.description)) {
    return false;
  }
  return true;
}

function filterMessageDocument(document: MessageDocument, input: MessageSearchInput) {
  const filters = input.filters;
  const keyword = cleanSearchValue(filters.keyword ?? input.query);
  if (keyword && !textIncludes(document.content, keyword)) {
    return false;
  }
  if (filters.chatId && document.chatId !== filters.chatId) {
    return false;
  }
  if (filters.senderUserId && document.senderId !== filters.senderUserId) {
    return false;
  }
  if (filters.senderUsername && !textEquals(document.senderUsername, normalizeHandle(filters.senderUsername))) {
    return false;
  }
  if (filters.hasMedia !== undefined && Boolean(document.hasMedia) !== filters.hasMedia) {
    return false;
  }
  if (filters.containsLinks !== undefined && Boolean(document.containsLinks) !== filters.containsLinks) {
    return false;
  }
  if (filters.minLength !== undefined && (document.contentLength ?? document.content.length) < filters.minLength) {
    return false;
  }

  const timestampMs = document.timestampMs ?? numericDate(document.timestamp ?? undefined);
  const startMs = numericDate(filters.dateStart);
  const endMs = numericDate(filters.dateEnd);
  if (startMs !== null && (timestampMs === null || timestampMs < startMs)) {
    return false;
  }
  if (endMs !== null && (timestampMs === null || timestampMs > endMs)) {
    return false;
  }

  return true;
}

function buildProfileFilter(input: ProfileSearchInput) {
  const filters = input.filters;
  const filterParts: string[] = [];
  if (filters.userId) {
    filterParts.push(`userId = ${escapeFilterValue(filters.userId)}`);
  }
  const phoneHash = hashPhoneNumber(filters.phone);
  if (phoneHash) {
    filterParts.push(`phoneHash = ${escapeFilterValue(phoneHash)}`);
  }
  return filterParts;
}

function buildChatFilter(kind: "channel" | "group", input: ChannelSearchInput | GroupSearchInput) {
  const filters = input.filters;
  const filterParts = [kind === "channel" ? `chatType = "channel"` : `chatType IN ["group", "supergroup"]`];

  if ("channelId" in filters && filters.channelId) {
    filterParts.push(`chatId = ${escapeFilterValue(filters.channelId)}`);
  }
  if ("chatId" in filters && filters.chatId) {
    filterParts.push(`chatId = ${escapeFilterValue(filters.chatId)}`);
  }

  return filterParts;
}

function buildMessageFilter(input: MessageSearchInput) {
  const filters = input.filters;
  const filterParts: string[] = [];
  if (filters.chatId) {
    filterParts.push(`chatId = ${escapeFilterValue(filters.chatId)}`);
  }
  if (filters.senderUserId) {
    filterParts.push(`senderId = ${escapeFilterValue(filters.senderUserId)}`);
  }
  if (filters.senderUsername) {
    filterParts.push(`senderUsername = ${escapeFilterValue(normalizeHandle(filters.senderUsername) ?? "")}`);
  }
  if (filters.hasMedia !== undefined) {
    filterParts.push(`hasMedia = ${filters.hasMedia}`);
  }
  if (filters.containsLinks !== undefined) {
    filterParts.push(`containsLinks = ${filters.containsLinks}`);
  }
  if (filters.minLength !== undefined) {
    filterParts.push(`contentLength >= ${filters.minLength}`);
  }
  const startMs = numericDate(filters.dateStart);
  const endMs = numericDate(filters.dateEnd);
  if (startMs !== null) {
    filterParts.push(`timestampMs >= ${startMs}`);
  }
  if (endMs !== null) {
    filterParts.push(`timestampMs <= ${endMs}`);
  }
  return filterParts;
}

async function searchProfilesViaIndex(input: ProfileSearchInput) {
  const paginationOffset = (input.page - 1) * input.limit;
  const querySource = cleanSearchValue(input.query)
    ?? cleanSearchValue(input.filters.username)
    ?? cleanSearchValue(input.filters.displayName)
    ?? cleanSearchValue(input.filters.bio)
    ?? "";

  const response = await searchIndex<ProfileDocument>(SEARCH_INDEXES.profiles, {
    q: querySource,
    filter: buildProfileFilter(input),
    offset: paginationOffset,
    limit: input.limit,
    showRankingScore: true,
  });

  const hits = response.hits.filter((hit) => filterProfileDocument(hit, input));
  return {
    hits,
    total: response.estimatedTotalHits ?? response.totalHits ?? hits.length,
  };
}

async function searchChatsViaIndex(kind: "channel" | "group", input: ChannelSearchInput | GroupSearchInput) {
  const paginationOffset = (input.page - 1) * input.limit;
  const querySource = cleanSearchValue(input.query)
    ?? cleanSearchValue(input.filters.username)
    ?? ("title" in input.filters ? cleanSearchValue(input.filters.title) : undefined)
    ?? ("displayName" in input.filters ? cleanSearchValue(input.filters.displayName) : undefined)
    ?? cleanSearchValue(input.filters.description)
    ?? "";

  const response = await searchIndex<ChatDocument>(SEARCH_INDEXES.chats, {
    q: querySource,
    filter: buildChatFilter(kind, input),
    offset: paginationOffset,
    limit: input.limit,
    showRankingScore: true,
    sort: ["memberCount:desc"],
  });

  const hits = response.hits.filter((hit) => filterChatDocument(hit, input));
  return {
    hits,
    total: response.estimatedTotalHits ?? response.totalHits ?? hits.length,
  };
}

async function searchMessagesViaIndex(input: MessageSearchInput) {
  const paginationOffset = (input.page - 1) * input.limit;
  const keyword = cleanSearchValue(input.filters.keyword ?? input.query) ?? "";
  const response = await searchIndex<MessageDocument>(SEARCH_INDEXES.messages, {
    q: keyword,
    filter: buildMessageFilter(input),
    offset: paginationOffset,
    limit: input.limit,
    attributesToHighlight: ["content"],
    attributesToCrop: ["content"],
    cropLength: 180,
    showRankingScore: true,
    sort: ["timestampMs:desc"],
  });

  const hits = response.hits.filter((hit) => filterMessageDocument(hit, input));
  return {
    hits,
    total: response.estimatedTotalHits ?? response.totalHits ?? hits.length,
  };
}

async function buildProfileResults(
  documents: Array<ProfileDocument & { _rankingScore?: number }>,
  input: ProfileSearchInput,
  context: SearchContext,
  historyMap?: Map<string, import("./queries").HistoryRecordLight[]>
): Promise<ProfileResult[]> {
  const trackingMap = await loadTrackingStatusMap(
    context.viewer.userId,
    documents.map((document) => document.userId)
  );
  const redactions = await loadRedactionMap("user", documents.map((document) => document.userId));

  return documents.flatMap((document) => {
    const reasons: string[] = [];
    if (textEquals(document.username, normalizeHandle(input.query))) addReason(reasons, "username exact match");

    const historyRecords = historyMap?.get(document.userId) || [];
    const historyDisplayName = getLatestHistoryValue(historyRecords, "display_name");
    const historyBio = getLatestHistoryValue(historyRecords, "bio");
    const historyUsernames = getLatestHistoryValue(historyRecords, "usernames");
    let effectiveUsername = document.username ?? null;
    if (!effectiveUsername && historyUsernames) {
      try {
        const usernamesArr = JSON.parse(historyUsernames);
        effectiveUsername = Array.isArray(usernamesArr) ? usernamesArr[usernamesArr.length - 1] : usernamesArr;
      } catch {
        effectiveUsername = historyUsernames;
      }
    }
    const effectiveDisplayName = historyDisplayName ?? document.displayName;
    const effectiveBio = historyBio ?? document.bio;

    if (textIncludes(effectiveDisplayName, input.filters.displayName ?? input.query)) addReason(reasons, "display name match");
    if (textIncludes(effectiveBio, input.filters.bio ?? input.query)) addReason(reasons, "bio match");
    if (document.userId === input.filters.userId || (input.query && isTelegramId(input.query) && document.userId === input.query)) {
      addReason(reasons, "user ID exact match");
    }
    if (input.filters.phone && document.phoneHash === hashPhoneNumber(input.filters.phone)) {
      addReason(reasons, "phone hash exact match");
    }
    if (reasons.length === 0) addReason(reasons, "fuzzy profile search");

    const { firstSeen, lastSeen } = getFirstAndLastSeenFromHistory(historyRecords, serializeDate(document.createdAt));

    const result: ProfileResult = {
      resultType: "profile",
      username: effectiveUsername,
      displayName: effectiveDisplayName ?? null,
      profilePhoto: toApiServedAssetUrl(document.profilePhoto),
      telegramUserId: document.userId,
      basicMetadata: {
        firstSeen,
        lastSeen,
        isTelegramPremium: document.isTelegramPremium ?? null,
        trackingStatus: trackingMap.get(document.userId) ?? null,
      },
      bio: effectiveBio ?? null,
      phoneMasked: document.phoneMasked ?? null,
      relevance: createRelevance(document._rankingScore, reasons),
      redaction: buildRedactionMetadata(redactions.get(document.userId)),
    };

    const redaction = redactions.get(document.userId);
    if (redaction?.type === "full" && !context.viewer.canBypassRedactions) {
      return [];
    }

    const redacted = applyResolvedRedaction(result, redaction, context.viewer);
    if (!redacted) {
      return [];
    }
    return [redacted as ProfileResult];
  });
}

function getLatestHistoryValue(records: import("./queries").HistoryRecordLight[], field: string): string | null {
  const fieldRecords = records.filter(r => r.field === field);
  if (fieldRecords.length === 0) return null;
  fieldRecords.sort((a, b) => {
    const dateA = a.changed_at instanceof Date ? a.changed_at : new Date(a.changed_at);
    const dateB = b.changed_at instanceof Date ? b.changed_at : new Date(b.changed_at);
    return dateB.getTime() - dateA.getTime();
  });
  return fieldRecords[0].new_value ?? null;
}

function getFirstAndLastSeenFromHistory(records: import("./queries").HistoryRecordLight[], fallbackCreatedAt: string | null): { firstSeen: string | null; lastSeen: string | null } {
  if (records.length === 0) {
    return { firstSeen: fallbackCreatedAt, lastSeen: fallbackCreatedAt };
  }
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const record of records) {
    const date = record.changed_at instanceof Date ? record.changed_at : new Date(record.changed_at);
    if (!earliest || date < earliest) earliest = date;
    if (!latest || date > latest) latest = date;
  }
  return {
    firstSeen: earliest?.toISOString() ?? fallbackCreatedAt,
    lastSeen: latest?.toISOString() ?? fallbackCreatedAt,
  };
}

async function buildChannelResults(
  documents: Array<ChatDocument & { _rankingScore?: number }>,
  input: ChannelSearchInput,
  context: SearchContext
): Promise<ChannelResult[]> {
  const redactions = await loadRedactionMap("channel", documents.map((document) => document.chatId));
  return documents.flatMap((document) => {
    const reasons: string[] = [];
    if (textEquals(document.username, normalizeHandle(input.query))) addReason(reasons, "channel username exact match");
    if (textIncludes(document.title, input.filters.title ?? input.query)) addReason(reasons, "channel title match");
    if (textIncludes(document.description, input.filters.description ?? input.query)) addReason(reasons, "channel description match");
    if (document.chatId === input.filters.channelId || (input.query && isTelegramId(input.query) && document.chatId === input.query)) {
      addReason(reasons, "channel ID exact match");
    }
    if (reasons.length === 0) addReason(reasons, "fuzzy channel search");

    const result: ChannelResult = {
      resultType: "channel",
      channelTitle: document.title ?? null,
      username: document.username ?? null,
      subscriberCount: document.memberCount ?? document.participantCount ?? null,
      channelDescription: document.description ?? null,
      profilePhoto: toApiServedAssetUrl(document.profilePhoto),
      telegramChatId: document.chatId,
      relevance: createRelevance(document._rankingScore, reasons),
      redaction: buildRedactionMetadata(redactions.get(document.chatId)),
    };

    const redaction = redactions.get(document.chatId);
    if (redaction?.type === "full" && !context.viewer.canBypassRedactions) {
      return [];
    }

    const redacted = applyResolvedRedaction(result, redaction, context.viewer);
    if (!redacted) {
      return [];
    }
    return [redacted as ChannelResult];
  });
}

async function buildGroupResults(
  documents: Array<ChatDocument & { _rankingScore?: number }>,
  input: GroupSearchInput,
  context: SearchContext
): Promise<GroupResult[]> {
  const redactions = await loadRedactionMap("group", documents.map((document) => document.chatId));
  return documents.flatMap((document) => {
    const reasons: string[] = [];
    if (textEquals(document.username, normalizeHandle(input.query))) addReason(reasons, "group username exact match");
    if (textIncludes(document.title, input.filters.displayName ?? input.query)) addReason(reasons, "group title match");
    if (textIncludes(document.description, input.filters.description ?? input.query)) addReason(reasons, "group description match");
    if (document.chatId === input.filters.chatId || (input.query && isTelegramId(input.query) && document.chatId === input.query)) {
      addReason(reasons, "group ID exact match");
    }
    if (reasons.length === 0) addReason(reasons, "fuzzy group search");

    const result: GroupResult = {
      resultType: "group",
      groupTitle: document.title ?? null,
      groupType: document.chatType ?? null,
      publicIndicator: document.username ? "public" : "private",
      profilePhoto: toApiServedAssetUrl(document.profilePhoto),
      telegramChatId: document.chatId,
      username: document.username ?? null,
      groupDescription: document.description ?? null,
      activityMetrics: {
        messageCount: null,
        memberCount: document.memberCount ?? document.participantCount ?? null,
        participantCount: document.participantCount ?? null,
      },
      relevance: createRelevance(document._rankingScore, reasons),
      redaction: buildRedactionMetadata(redactions.get(document.chatId)),
    };

    const redaction = redactions.get(document.chatId);
    if (redaction?.type === "full" && !context.viewer.canBypassRedactions) {
      return [];
    }

    const redacted = applyResolvedRedaction(result, redaction, context.viewer);
    if (!redacted) {
      return [];
    }
    return [redacted as GroupResult];
  });
}

function mergeRedactions(...redactions: Array<ResolvedRedaction | null | undefined>) {
  const existing = redactions.filter(Boolean) as ResolvedRedaction[];
  if (existing.length === 0) {
    return null;
  }

  const hasFull = existing.some((redaction) => redaction.type === "full");
  const hasMasked = existing.some((redaction) => redaction.type === "masked");
  return {
    id: existing.map((redaction) => redaction.id).join(":"),
    targetType: existing[0].targetType,
    targetId: existing.map((redaction) => redaction.targetId).join(":"),
    type: hasFull ? "full" : hasMasked ? "masked" : "partial",
    fields: Array.from(new Set(existing.flatMap((redaction) => redaction.fields))),
    reason: existing.map((redaction) => redaction.reason).filter(Boolean).join(" | ") || null,
  } as ResolvedRedaction;
}

async function buildMessageResults(
  documents: Array<MessageDocument & { _rankingScore?: number; _formatted?: Record<string, string> }>,
  input: MessageSearchInput,
  context: SearchContext
): Promise<MessageResult[]> {
  const senderIds = documents.map((document) => document.senderId).filter(Boolean) as string[];
  const chatIds = documents.map((document) => document.chatId);
  const chatRecords = await listChatsByIds(chatIds);
  const chatMap = new Map(chatRecords.map((chat) => [chat.chat_id, chat]));
  const userRedactions = await loadRedactionMap("user", senderIds);
  const channelRedactions = await loadRedactionMap("channel", chatRecords.filter((chat) => chat.chat_type === "channel").map((chat) => chat.chat_id));
  const groupRedactions = await loadRedactionMap("group", chatRecords.filter((chat) => chat.chat_type !== "channel").map((chat) => chat.chat_id));
  const keyword = cleanSearchValue(input.filters.keyword ?? input.query);

  return documents.flatMap((document) => {
    const chatRecord = chatMap.get(document.chatId);
    const chatRedaction = chatRecord?.chat_type === "channel"
      ? channelRedactions.get(document.chatId)
      : groupRedactions.get(document.chatId);
    const senderRedaction = document.senderId ? userRedactions.get(document.senderId) : null;
    const mergedRedaction = mergeRedactions(senderRedaction, chatRedaction);

    const reasons = ["message search match"];
    if (keyword) addReason(reasons, `keyword: ${keyword}`);
    if (input.filters.chatId && input.filters.chatId === document.chatId) addReason(reasons, "chat ID filter");
    if (input.filters.senderUserId && input.filters.senderUserId === document.senderId) addReason(reasons, "sender ID filter");

    const snippet = snippetFromText(document.content, keyword, 180);
    const highlightedSnippet = highlightSnippet(snippet, keyword);

    const baseResult: MessageResult = {
      resultType: "message",
      messageId: document.messageId,
      chatId: document.chatId,
      timestamp: serializeDate(document.timestamp),
      snippet,
      highlightedSnippet,
      matchedTerms: keyword ? [keyword] : [],
      sender: {
        userId: document.senderId ?? null,
        username: document.senderUsername ?? null,
        displayName: document.senderDisplayName ?? null,
      },
      chat: {
        chatId: document.chatId,
        title: document.chatTitle ?? chatRecord?.display_name ?? null,
        type: document.chatType ?? chatRecord?.chat_type ?? null,
        username: document.chatUsername ?? chatRecord?.username ?? null,
      },
      hasMedia: document.hasMedia ?? null,
      containsLinks: document.containsLinks ?? containsLink(document.content),
      contextLink: buildMessageContextLink(
        document.chatId,
        document.messageId,
        document.bucket,
        serializeDate(document.timestamp)
      ),
      relevance: createRelevance(document._rankingScore, reasons),
      redaction: buildRedactionMetadata(mergedRedaction),
    };

    if (!mergedRedaction || context.viewer.canBypassRedactions) {
      return [baseResult];
    }

    const result = { ...baseResult };
    if (mergedRedaction.fields.includes("messages")) {
      result.snippet = "[redacted]";
      result.highlightedSnippet = "[redacted]";
      result.matchedTerms = [];
    }
    if (mergedRedaction.fields.includes("username")) {
      result.sender.username = "[redacted]";
      result.chat.username = "[redacted]";
    }
    if (mergedRedaction.fields.includes("displayName")) {
      result.sender.displayName = "[redacted]";
      result.chat.title = "[redacted]";
    }
    if (mergedRedaction.fields.includes("userId")) {
      result.sender.userId = null;
    }

    return [result];
  });
}

export async function runUnifiedSearch(input: UnifiedSearchInput, context: SearchContext): Promise<UnifiedSearchResponse> {
  switch (input.type) {
    case "profile": {
      const result = await runProfileSearch(input, context);
      return {
        type: "profile",
        results: result.results,
        total: result.total,
        page: input.page,
        limit: input.limit,
      };
    }
    case "channel": {
      const result = await runChannelSearch(input, context);
      return {
        type: "channel",
        results: result.results,
        total: result.total,
        page: input.page,
        limit: input.limit,
      };
    }
    case "group": {
      const result = await runGroupSearch(input, context);
      return {
        type: "group",
        results: result.results,
        total: result.total,
        page: input.page,
        limit: input.limit,
      };
    }
    case "message": {
      const result = await runMessageSearch(input, context);
      return {
        type: "message",
        results: result.results,
        total: result.total,
        page: input.page,
        limit: input.limit,
      };
    }
  }
}

export async function runProfileSearch(input: ProfileSearchInput, context: SearchContext): Promise<SearchResultPage<ProfileResult>> {
  const queryInfo = classifyQuery(input.query);
  const exactUserId = input.filters.userId ?? (queryInfo.isNumeric ? queryInfo.query : undefined);

  if (exactUserId) {
    const user = await getUserById(exactUserId);
    if (!user) return { results: [], total: 0 };
    const historyMap = await getUserHistoryForBatch([user.user_id]);
    const historyRecords = historyMap.get(user.user_id) || [];
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
    const results = await buildProfileResults([{
      userId: user.user_id,
      username: effectiveUsername,
      displayName: user.display_name ?? null,
      bio: user.bio ?? null,
      profilePhoto: user.avatar_url ?? null,
      phoneHash: user.phone_hash ?? null,
      phoneMasked: user.phone_masked ?? null,
      createdAt: serializeDate(user.created_at),
      updatedAt: serializeDate(user.updated_at),
      isTelegramPremium: user.is_premium ?? null,
      _rankingScore: 1,
    }], input, context, historyMap);
    return { results, total: results.length };
  }

  const exactUsername = normalizeHandle(input.filters.username ?? (queryInfo.isHandle ? queryInfo.query : undefined));
  if (exactUsername) {
    const exact = await getUserByUsername(exactUsername);
    if (exact) {
      const historyMap = await getUserHistoryForBatch([exact.user_id]);
      const historyRecords = historyMap.get(exact.user_id) || [];
      const historyUsernames = getLatestHistoryValue(historyRecords, "usernames");
      let effectiveUsername = exact.username ?? null;
      if (!effectiveUsername && historyUsernames) {
        try {
          const usernamesArr = JSON.parse(historyUsernames);
          effectiveUsername = Array.isArray(usernamesArr) ? usernamesArr[usernamesArr.length - 1] : usernamesArr;
        } catch {
          effectiveUsername = historyUsernames;
        }
      }
      const results = await buildProfileResults([{
        userId: exact.user_id,
        username: effectiveUsername,
        displayName: exact.display_name ?? null,
        bio: exact.bio ?? null,
        profilePhoto: exact.avatar_url ?? null,
        phoneHash: exact.phone_hash ?? null,
        phoneMasked: exact.phone_masked ?? null,
        createdAt: serializeDate(exact.created_at),
        updatedAt: serializeDate(exact.updated_at),
        isTelegramPremium: exact.is_premium ?? null,
        _rankingScore: 1,
      }], input, context, historyMap);
      if (results.length > 0) {
        return { results, total: results.length };
      }
    }
  }

  const indexed = await searchProfilesViaIndex(input);
  const indexedUserIds = indexed.hits.map(h => h.userId);
  const historyMap = indexedUserIds.length > 0 ? await getUserHistoryForBatch(indexedUserIds) : new Map();
  const results = await buildProfileResults(indexed.hits, input, context, historyMap);
  return { results, total: indexed.total };
}

export async function runChannelSearch(input: ChannelSearchInput, context: SearchContext): Promise<SearchResultPage<ChannelResult>> {
  const queryInfo = classifyQuery(input.query);
  const exactChatId = input.filters.channelId ?? (queryInfo.isNumeric ? queryInfo.query : undefined);
  if (exactChatId) {
    const chat = await getChatById(exactChatId);
    if (!chat || chat.chat_type !== "channel") return { results: [], total: 0 };
    const results = await buildChannelResults([{
      chatId: chat.chat_id,
      chatType: chat.chat_type ?? null,
      username: chat.username ?? null,
      title: chat.display_name ?? null,
      description: chat.bio ?? null,
      memberCount: chat.member_count ?? null,
      participantCount: chat.participants_count ?? null,
      profilePhoto: chat.avatar_url ?? null,
      createdAt: serializeDate(chat.created_at),
      updatedAt: serializeDate(chat.updated_at),
      _rankingScore: 1,
    }], input, context);
    return { results, total: results.length };
  }

  const indexed = await searchChatsViaIndex("channel", input);
  const results = await buildChannelResults(indexed.hits, input, context);
  return { results, total: indexed.total };
}

export async function runGroupSearch(input: GroupSearchInput, context: SearchContext): Promise<SearchResultPage<GroupResult>> {
  const queryInfo = classifyQuery(input.query);
  const exactChatId = input.filters.chatId ?? (queryInfo.isNumeric ? queryInfo.query : undefined);
  if (exactChatId) {
    const chat = await getChatById(exactChatId);
    if (!chat || !["group", "supergroup"].includes(chat.chat_type ?? "")) return { results: [], total: 0 };
    const results = await buildGroupResults([{
      chatId: chat.chat_id,
      chatType: chat.chat_type ?? null,
      username: chat.username ?? null,
      title: chat.display_name ?? null,
      description: chat.bio ?? null,
      memberCount: chat.member_count ?? null,
      participantCount: chat.participants_count ?? null,
      profilePhoto: chat.avatar_url ?? null,
      createdAt: serializeDate(chat.created_at),
      updatedAt: serializeDate(chat.updated_at),
      _rankingScore: 1,
    }], input, context);
    return { results, total: results.length };
  }

  const indexed = await searchChatsViaIndex("group", input);
  const results = await buildGroupResults(indexed.hits, input, context);
  return { results, total: indexed.total };
}

export async function runMessageSearch(input: MessageSearchInput, context: SearchContext): Promise<SearchResultPage<MessageResult>> {
  const indexed = await searchMessagesViaIndex(input);
  const results = await buildMessageResults(indexed.hits, input, context);
  return { results, total: indexed.total };
}

export async function getLookupMessage(
  chatId: string,
  messageId: string,
  context: SearchContext,
  lookupHints?: { bucket?: string | null; timestamp?: string | null }
) {
  let message = await getMessageById(chatId, messageId);
  const hintTimestamp = parseLookupTimestamp(lookupHints?.timestamp);
  const hintBucket = lookupHints?.bucket ?? formatMessageBucket(hintTimestamp);

  if (!message && hintBucket && hintTimestamp) {
    message = await getMessageByChatBucketTimestamp(chatId, hintBucket, hintTimestamp, messageId);
  }

  if (!message) {
    return null;
  }

  const [chat, sender] = await Promise.all([
    getChatById(chatId),
    message.user_id ? getUserById(message.user_id) : Promise.resolve(null),
  ]);
  const senderRedactions = message.user_id ? await loadRedactionMap("user", [message.user_id]) : new Map();
  const chatRedaction = chat?.chat_type === "channel"
    ? (await loadRedactionMap("channel", [chatId])).get(chatId)
    : (await loadRedactionMap("group", [chatId])).get(chatId);
  const mergedRedaction = mergeRedactions(message.user_id ? senderRedactions.get(message.user_id) : null, chatRedaction);
  if (mergedRedaction?.type === "full" && !context.viewer.canBypassRedactions) {
    return null;
  }

  const content = String(message.content ?? "");
  const messageTimestamp = serializeDate(message.timestamp ?? message.created_at);
  const messageBucket = message.bucket ?? hintBucket ?? formatMessageBucket(message.timestamp ?? message.created_at);
  return {
    messageId: String(message.message_id),
    chatId: String(message.chat_id),
    timestamp: messageTimestamp,
    content: mergedRedaction && !context.viewer.canBypassRedactions && mergedRedaction.fields.includes("messages")
      ? "[redacted]"
      : content,
    highlightedSnippet: mergedRedaction && !context.viewer.canBypassRedactions && mergedRedaction.fields.includes("messages")
      ? "[redacted]"
      : highlightSnippet(snippetFromText(content, undefined, 220), undefined),
    hasMedia: message.has_media ?? Boolean(message.media_type || message.media_url),
    containsLinks: containsLink(content),
    sender: {
      userId: message.user_id ?? null,
      username: mergedRedaction && !context.viewer.canBypassRedactions && mergedRedaction.fields.includes("username")
        ? "[redacted]"
        : sender?.username ?? null,
      displayName: mergedRedaction && !context.viewer.canBypassRedactions && mergedRedaction.fields.includes("displayName")
        ? "[redacted]"
        : sender?.display_name ?? null,
    },
    chat: {
      chatId: String(message.chat_id),
      title: mergedRedaction && !context.viewer.canBypassRedactions && mergedRedaction.fields.includes("displayName")
        ? "[redacted]"
        : chat?.display_name ?? null,
      type: chat?.chat_type ?? null,
      username: mergedRedaction && !context.viewer.canBypassRedactions && mergedRedaction.fields.includes("username")
        ? "[redacted]"
        : chat?.username ?? null,
    },
    contextLink: buildMessageContextLink(String(message.chat_id), String(message.message_id), messageBucket, messageTimestamp),
    redaction: buildRedactionMetadata(mergedRedaction),
  };
}
