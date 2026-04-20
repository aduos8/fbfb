import { getCassandraClient, getUserById, getUserByUsername, listUsersByIds, searchUsers, getChatById, listChatsByIds, searchChats, listMessagesByChatBucket, listMessagesByUserBucket, searchMessages } from "./queries";
import { applyRedactions } from "./redactions";
import { toApiServedAssetUrl } from "./storageAssets";
import type {
  ChannelSearchInput,
  GroupSearchInput,
  MessageSearchInput,
  ProfileSearchInput,
  UnifiedSearchInput,
} from "./searchSchemas";

export type {
  ChannelSearchInput,
  GroupSearchInput,
  MessageSearchInput,
  ProfileSearchInput,
  UnifiedSearchInput,
} from "./searchSchemas";

type ViewerRole = "user" | "admin" | "owner";

type BillingOptions = {
  chargeCredits?: boolean;
  userId?: string;
};

type SearchContext = {
  role: ViewerRole;
} & BillingOptions;

type RankedRecord = Record<string, unknown> & {
  relevanceScore: number;
  confidence: "high" | "medium" | "low";
  matchReasons: string[];
};

type MatchAccumulator = {
  score: number;
  reasons: string[];
};

function currentBucket() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeBucket(value: string | undefined) {
  const digits = value?.replace(/\D/g, "");
  return digits && digits.length >= 6 ? digits.slice(0, 6) : undefined;
}

function isTelegramId(value: string | undefined) {
  return !!value && /^-?\d+$/.test(value);
}

function cleanSearchValue(value: string | undefined) {
  return value?.trim();
}

function normalizeHandle(value: string | undefined) {
  const trimmed = cleanSearchValue(value);
  return trimmed?.replace(/^@/, "");
}

function normalizeEntityId(value: string | number | undefined): string {
  if (!value) return "";
  return String(value);
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function serializeDateValue(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function pushMatch(meta: MatchAccumulator, score: number, reason: string) {
  if (score <= 0) return;
  meta.score += score;
  meta.reasons.push(reason);
}

function scoreTextMatch(
  meta: MatchAccumulator,
  value: unknown,
  query: string | undefined,
  label: string,
  weights: { exact: number; prefix: number; contains: number }
) {
  const normalizedValue = normalizeText(value);
  const normalizedQuery = normalizeText(query);
  if (!normalizedValue || !normalizedQuery) return;

  if (normalizedValue === normalizedQuery) {
    pushMatch(meta, weights.exact, `${label} exact match`);
    return;
  }
  if (normalizedValue.startsWith(normalizedQuery)) {
    pushMatch(meta, weights.prefix, `${label} prefix match`);
    return;
  }
  if (normalizedValue.includes(normalizedQuery)) {
    pushMatch(meta, weights.contains, `${label} partial match`);
  }
}

function scoreIdMatch(meta: MatchAccumulator, value: unknown, query: string | undefined, label: string, exactScore: number) {
  if (!query) return;
  const normalizedValue = normalizeEntityId(value as string);
  if (normalizedValue && normalizedValue === normalizeEntityId(query)) {
    pushMatch(meta, exactScore, `${label} exact match`);
  }
}

function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 110) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function sortRankedResults<T extends RankedRecord>(records: T[]) {
  return [...records].sort((left, right) => {
    if (right.relevanceScore !== left.relevanceScore) {
      return right.relevanceScore - left.relevanceScore;
    }
    return 0;
  });
}

function createMatchAccumulator(): MatchAccumulator {
  return { score: 0, reasons: [] };
}

function rankProfileRecord(record: Record<string, unknown>, input: { query?: string; username?: string; displayName?: string; bio?: string; userId?: string }) {
  const meta = createMatchAccumulator();
  const genericQuery = input.query && !input.query.startsWith("@") && !isTelegramId(input.query) ? input.query : undefined;
  const prioritizedUsername = normalizeHandle(input.username ?? (input.query?.startsWith("@") ? input.query : undefined));

  scoreIdMatch(meta, record.user_id, input.userId ?? (isTelegramId(input.query) ? input.query : undefined), "user ID", 140);
  scoreTextMatch(meta, record.username, prioritizedUsername ?? genericQuery, "username", { exact: 130, prefix: 110, contains: 95 });
  scoreTextMatch(meta, record.display_name, input.displayName ?? genericQuery, "display name", { exact: 110, prefix: 90, contains: 72 });
  scoreTextMatch(meta, record.bio, input.bio ?? genericQuery, "bio", { exact: 86, prefix: 74, contains: 60 });

  if (meta.score === 0) {
    pushMatch(meta, 40, "metadata fallback");
  }

  return meta;
}

function rankChatRecord(
  record: Record<string, unknown>,
  input: { query?: string; username?: string; displayName?: string; description?: string; chatId?: string },
  mode: "channel" | "group"
) {
  const meta = createMatchAccumulator();
  const genericQuery = input.query && !input.query.startsWith("@") && !isTelegramId(input.query) ? input.query : undefined;
  const prioritizedUsername = normalizeHandle(input.username ?? (input.query?.startsWith("@") ? input.query : undefined));

  scoreIdMatch(meta, record.chat_id, input.chatId ?? (isTelegramId(input.query) ? input.query : undefined), `${mode} ID`, 140);
  scoreTextMatch(meta, record.username, prioritizedUsername ?? genericQuery, `${mode} username`, { exact: 128, prefix: 108, contains: 92 });
  scoreTextMatch(meta, record.display_name, input.displayName ?? genericQuery, `${mode} title`, { exact: 110, prefix: 92, contains: 74 });
  scoreTextMatch(meta, record.bio, input.description ?? genericQuery, `${mode} description`, { exact: 82, prefix: 70, contains: 58 });

  if (meta.score === 0) {
    pushMatch(meta, 40, `${mode} metadata fallback`);
  }

  return meta;
}

function toProfileResult(record: Record<string, unknown>, input: ProfileSearchInput): RankedRecord {
  const match = rankProfileRecord(record, {
    query: cleanSearchValue(input.query),
    username: normalizeHandle(input.username ?? input.query),
    displayName: cleanSearchValue(input.displayName),
    bio: cleanSearchValue(input.bio),
    userId: input.userId,
  });

  return {
    ...record,
    avatar_url: toApiServedAssetUrl(record.avatar_url as string | null | undefined),
    resultType: "profile",
    username: record.username ?? null,
    displayName: record.display_name ?? null,
    profilePhoto: toApiServedAssetUrl(record.avatar_url as string | null | undefined),
    telegramUserId: normalizeEntityId(record.user_id as string | number),
    firstSeen: serializeDateValue(record.created_at ?? record.updated_at),
    lastSeen: serializeDateValue(record.updated_at ?? record.created_at),
    relevanceScore: match.score,
    confidence: confidenceFromScore(match.score),
    matchReasons: match.reasons,
  };
}

function toChannelResult(record: Record<string, unknown>, input: ChannelSearchInput): RankedRecord {
  const match = rankChatRecord(record, {
    query: cleanSearchValue(input.query),
    username: normalizeHandle(input.username ?? input.query),
    displayName: cleanSearchValue(input.title ?? input.query),
    description: cleanSearchValue(input.description),
    chatId: input.chatId,
  }, "channel");

  return {
    ...record,
    avatar_url: toApiServedAssetUrl(record.avatar_url as string | null | undefined),
    resultType: "channel",
    channelTitle: record.display_name ?? null,
    username: record.username ?? null,
    subscriberCount: typeof record.participants_count === "number" ? record.participants_count : typeof record.member_count === "number" ? record.member_count : null,
    channelDescription: record.bio ?? null,
    profilePhoto: toApiServedAssetUrl(record.avatar_url as string | null | undefined),
    telegramChatId: normalizeEntityId(record.chat_id as string | number),
    relevanceScore: match.score,
    confidence: confidenceFromScore(match.score),
    matchReasons: match.reasons,
  };
}

function toGroupResult(record: Record<string, unknown>, input: GroupSearchInput): RankedRecord {
  const match = rankChatRecord(record, {
    query: cleanSearchValue(input.query),
    username: normalizeHandle(input.username ?? input.query),
    displayName: cleanSearchValue(input.displayName ?? input.query),
    description: cleanSearchValue(input.description),
    chatId: input.chatId,
  }, "group");

  return {
    ...record,
    avatar_url: toApiServedAssetUrl(record.avatar_url as string | null | undefined),
    resultType: "group",
    groupTitle: record.display_name ?? null,
    groupType: record.chat_type ?? "group",
    publicIndicator: record.username ? "public" : "private",
    username: record.username ?? null,
    groupDescription: record.bio ?? null,
    activityMetrics: {
      memberCount: typeof record.member_count === "number" ? record.member_count : null,
      participantCount: typeof record.participants_count === "number" ? record.participants_count : null,
    },
    profilePhoto: toApiServedAssetUrl(record.avatar_url as string | null | undefined),
    telegramChatId: normalizeEntityId(record.chat_id as string | number),
    relevanceScore: match.score,
    confidence: confidenceFromScore(match.score),
    matchReasons: match.reasons,
  };
}

async function normalizeProfileResults(records: Record<string, unknown>[], input: ProfileSearchInput) {
  return sortRankedResults(records.map((record) => toProfileResult(record, input)));
}

async function normalizeChannelResults(records: Record<string, unknown>[], input: ChannelSearchInput) {
  return sortRankedResults(records.map((record) => toChannelResult(record, input)));
}

async function normalizeGroupResults(records: Record<string, unknown>[], input: GroupSearchInput) {
  return sortRankedResults(records.map((record) => toGroupResult(record, input)));
}

async function redactResults<T extends Record<string, unknown>>(
  records: T[],
  role: ViewerRole
) {
  if (role === "admin" || role === "owner") {
    return records;
  }
  return records.map((record) => applyRedactions(record, null, role));
}

export async function runUnifiedSearch(input: UnifiedSearchInput, context: SearchContext) {
  const page = input.page ?? 1;
  const limit = input.limit ?? 25;
  const offset = (page - 1) * limit;

  switch (input.type) {
    case "profile": {
      const result = await runProfileSearch(
        {
          query: input.q,
          username: input.q?.startsWith("@") ? input.q : undefined,
          userId: input.filterUsername ? input.filterUsername : (isTelegramId(input.q) ? input.q : undefined),
          displayName: input.filterUsername,
          limit,
          offset,
        },
        context
      );
      return { type: input.type, results: result.results, total: result.total };
    }
    case "channel": {
      const result = await runChannelSearch(
        {
          query: input.q,
          username: input.q?.startsWith("@") ? input.q : undefined,
          chatId: isTelegramId(input.q) ? input.q : undefined,
          title: input.filterUsername,
          limit,
          offset,
        } as ChannelSearchInput,
        context
      );
      return { type: input.type, results: result.results, total: result.total };
    }
    case "group": {
      const result = await runGroupSearch(
        {
          query: input.q,
          username: input.q?.startsWith("@") ? input.q : undefined,
          chatId: isTelegramId(input.q) ? input.q : undefined,
          displayName: input.filterUsername,
          limit,
          offset,
        } as GroupSearchInput,
        context
      );
      return { type: input.type, results: result.results, total: result.total };
    }
    case "message": {
      const result = await runMessageSearch(
        {
          keyword: input.q,
          chatId: input.filterChatId,
          bucket: input.filterBucket,
          senderId: input.filterSenderId,
          dateRange: (input.filterDateStart || input.filterDateEnd) ? {
            start: input.filterDateStart,
            end: input.filterDateEnd,
          } : undefined,
          hasMedia: input.filterHasMedia,
          containsLinks: input.filterHasLinks,
          minLength: input.filterMinLength,
        },
        context
      );
      return { type: input.type, results: result.results, total: result.total };
    }
  }
}

export async function runProfileSearch(input: ProfileSearchInput, context: SearchContext) {
  let results: Record<string, unknown>[] = [];
  let total = 0;
  const limit = input.limit ?? 25;
  const offset = input.offset ?? 0;

  try {
    if (input.userId) {
      const user = await getUserById(input.userId);
      results = user ? [user as Record<string, unknown>] : [];
      total = results.length;
    } else if (input.username) {
      const user = await getUserByUsername(normalizeHandle(input.username) ?? "");
      results = user ? [user as Record<string, unknown>] : [];
      total = results.length;
    } else if (input.displayName) {
      const pageResult = await searchUsers(input.displayName, limit, offset);
      results = pageResult.results;
      total = pageResult.total;
    } else if (input.bio) {
      const pageResult = await searchUsers(input.bio, limit, offset);
      results = pageResult.results;
      total = pageResult.total;
    } else if (input.query) {
      if (input.query.startsWith("@")) {
        const user = await getUserByUsername(normalizeHandle(input.query));
        results = user ? [user as Record<string, unknown>] : [];
        total = results.length;
      } else if (isTelegramId(input.query)) {
        const user = await getUserById(input.query);
        results = user ? [user as Record<string, unknown>] : [];
        total = results.length;
      } else {
        const pageResult = await searchUsers(input.query, limit, offset);
        results = pageResult.results;
        total = pageResult.total;
      }
    }
  } catch (error) {
    console.warn("[runProfileSearch] error:", error);
  }

  const redacted = await redactResults(results, context.role);
  const normalized = await normalizeProfileResults(redacted, input);
  return { results: normalized, total };
}

export async function runChannelSearch(input: ChannelSearchInput, context: SearchContext) {
  let results: Record<string, unknown>[] = [];
  let total = 0;
  const limit = input.limit ?? 25;
  const offset = input.offset ?? 0;

  try {
    if (input.chatId) {
      const chat = await getChatById(input.chatId);
      if (chat && chat.chat_type === "channel") {
        results = [chat as Record<string, unknown>];
        total = results.length;
      }
    } else if (input.username) {
      const pageResult = await searchChats(normalizeHandle(input.username) ?? "", "channel", limit, offset);
      results = pageResult.results as Record<string, unknown>[];
      total = pageResult.total;
    } else if (input.title) {
      const pageResult = await searchChats(input.title, "channel", limit, offset);
      results = pageResult.results as Record<string, unknown>[];
      total = pageResult.total;
    } else if (input.description) {
      const pageResult = await searchChats(input.description, "channel", limit, offset);
      results = pageResult.results as Record<string, unknown>[];
      total = pageResult.total;
    } else if (input.query) {
      if (input.query.startsWith("@")) {
        const pageResult = await searchChats(normalizeHandle(input.query) ?? "", "channel", limit, offset);
        results = pageResult.results as Record<string, unknown>[];
        total = pageResult.total;
      } else {
        const pageResult = await searchChats(input.query, "channel", limit, offset);
        results = pageResult.results as Record<string, unknown>[];
        total = pageResult.total;
      }
    }
  } catch (error) {
    console.warn("[runChannelSearch] error:", error);
  }

  const redacted = await redactResults(results, context.role);
  const normalized = await normalizeChannelResults(redacted, input);
  return { results: normalized, total };
}

export async function runGroupSearch(input: GroupSearchInput, context: SearchContext) {
  let results: Record<string, unknown>[] = [];
  let total = 0;
  const limit = input.limit ?? 25;
  const offset = input.offset ?? 0;

  try {
    if (input.chatId) {
      const chat = await getChatById(input.chatId);
      if (chat && (chat.chat_type === "group" || chat.chat_type === "supergroup")) {
        results = [chat as Record<string, unknown>];
        total = results.length;
      }
    } else if (input.username) {
      const pageResult = await searchChats(normalizeHandle(input.username) ?? "", undefined, limit, offset);
      results = pageResult.results.filter(c => c.chat_type === "group" || c.chat_type === "supergroup") as unknown as Record<string, unknown>[];
      total = pageResult.total;
    } else if (input.displayName) {
      const pageResult = await searchChats(input.displayName, undefined, limit, offset);
      results = pageResult.results.filter(c => c.chat_type === "group" || c.chat_type === "supergroup") as unknown as Record<string, unknown>[];
      total = pageResult.total;
    } else if (input.description) {
      const pageResult = await searchChats(input.description, undefined, limit, offset);
      results = pageResult.results.filter(c => c.chat_type === "group" || c.chat_type === "supergroup") as unknown as Record<string, unknown>[];
      total = pageResult.total;
    } else if (input.query) {
      if (input.query.startsWith("@")) {
        const pageResult = await searchChats(normalizeHandle(input.query) ?? "", undefined, limit, offset);
        results = pageResult.results.filter(c => c.chat_type === "group" || c.chat_type === "supergroup") as unknown as Record<string, unknown>[];
        total = pageResult.total;
      } else {
        const pageResult = await searchChats(input.query, undefined, limit, offset);
        results = pageResult.results.filter(c => c.chat_type === "group" || c.chat_type === "supergroup") as unknown as Record<string, unknown>[];
        total = pageResult.total;
      }
    }
  } catch (error) {
    console.warn("[runGroupSearch] error:", error);
  }

  const redacted = await redactResults(results, context.role);
  const normalized = await normalizeGroupResults(redacted, input);
  return { results: normalized, total };
}

export async function runMessageSearch(input: MessageSearchInput, context: SearchContext) {
  const bucket = normalizeBucket(input.bucket) ?? currentBucket();
  let messages: Record<string, unknown>[] = [];

  try {
    if (input.keyword) {
      messages = await searchMessages(input.keyword, 100);
    }

    if (messages.length === 0) {
      if (input.senderId) {
        messages = await listMessagesByUserBucket(input.senderId, bucket, 100);
      } else if (input.chatId) {
        messages = await listMessagesByChatBucket(input.chatId, bucket, 100);
      }
    }

    if (input.keyword && messages.length > 0) {
      const keyword = input.keyword.toLowerCase();
      messages = messages.filter(msg => {
        const content = String(msg.content ?? "").toLowerCase();
        return content.includes(keyword);
      });
    }

    if (input.senderId && messages.length === 0) {
      messages = await listMessagesByUserBucket(input.senderId, bucket, 100);
    }

    if (input.chatId && messages.length === 0) {
      messages = await listMessagesByChatBucket(input.chatId, bucket, 100);
    }

    if (input.dateRange) {
      const { start, end } = input.dateRange;
      if (start || end) {
        messages = messages.filter(msg => {
          const ts = msg.timestamp || msg.created_at;
          if (!ts) return false;
          const date = new Date(ts as string | Date);
          if (start && date < new Date(start)) return false;
          if (end && date > new Date(end)) return false;
          return true;
        });
      }
    }

    if (input.hasMedia !== undefined) {
      messages = messages.filter(msg => {
        const hasMedia = msg.has_media ?? (msg.media_type || msg.media_url);
        return input.hasMedia ? !!hasMedia : !hasMedia;
      });
    }

    if (input.containsLinks) {
      const linkPattern = /https?:\/\/[^\s]+/i;
      messages = messages.filter(msg => {
        const content = String(msg.content ?? "");
        return linkPattern.test(content);
      });
    }

    if (input.minLength !== undefined && input.minLength > 0) {
      messages = messages.filter(msg => {
        const content = String(msg.content ?? "");
        return content.length >= input.minLength!;
      });
    }

    messages = messages.slice(0, 100);
  } catch (error) {
    console.warn("[runMessageSearch] error:", error);
  }

  const redacted = await redactResults(messages, context.role);
  return { results: redacted, total: redacted.length };
}
