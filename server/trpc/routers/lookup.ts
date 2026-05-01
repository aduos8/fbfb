import { router } from "../init";
import { z } from "zod";
import {
  ChatActivityEntrySchema,
  LookupChatSchema,
  LookupMessageSchema,
  LookupMessagesResponseSchema,
  LookupUserSchema,
  UserHistoryResponseSchema,
} from "../../../shared/api";
import {
  getChatById,
  getUserById,
  getUserByUsername,
  getUserHistory,
  getUserHistoryForBatch,
  getParticipationMetaByUser,
  getParticipationByUser,
  listChatsByIds,
  listMessagesByChatBucket,
  listMessagesByChatBucketForUser,
  listMessagesByIdForUser,
  listMessagesByUserBucket,
  formatMessageBucket,
  type HistoryRecordLight,
  type MessageRecord,
  type ParticipationMetaRecord,
} from "../../lib/tg-queries/queries";
import { searchModeProcedure } from "../../lib/tg-queries/searchModeProcedure";
import { canUseMessageSearch, canUseProfileFullAccess, getViewerAccess } from "../../lib/tg-queries/viewer";
import { buildRedactionMetadata, loadSingleRedaction, loadRedactionMap, applyResolvedRedaction } from "../../lib/tg-queries/redactions";
import { toApiServedAssetUrl } from "../../lib/tg-queries/storageAssets";
import { getTrackingByProfile } from "../../lib/db/tracking";
import { maskPhoneNumber } from "../../lib/tg-queries/phone";
import { getLookupMessage } from "../../lib/tg-queries/searchService";

function buildRecentBuckets(monthsBack: number = 12) {
  const buckets: string[] = [];
  const now = new Date();
  for (let offset = 0; offset < monthsBack; offset += 1) {
    const point = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    buckets.push(`${point.getUTCFullYear()}-${String(point.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return buckets;
}

function buildAllBucketsDescending(startYear = 2013, startMonth = 1) {
  const buckets: string[] = [];
  const now = new Date();
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(startYear, startMonth - 1, 1));

  while (cursor >= stop) {
    buckets.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return buckets;
}

function parseBucketParts(bucket: string) {
  const match = bucket.match(/^(\d{4})-?(\d{2})$/);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
  };
}

function buildBucketsBetweenDescending(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  const startBucket = formatMessageBucket(start);
  const endBucket = formatMessageBucket(end);
  if (!startBucket && !endBucket) {
    return [];
  }

  const first = startBucket ?? endBucket!;
  const last = endBucket ?? startBucket!;
  const firstParts = parseBucketParts(first);
  const lastParts = parseBucketParts(last);
  if (!firstParts || !lastParts) {
    return [];
  }

  const cursor = new Date(Date.UTC(lastParts.year, lastParts.monthIndex, 1));
  const stop = new Date(Date.UTC(firstParts.year, firstParts.monthIndex, 1));
  const buckets: string[] = [];

  while (cursor >= stop) {
    buckets.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return buckets;
}

function parseCursor(cursor: string | undefined | null) {
  const offset = Number(cursor ?? 0);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

async function buildViewer(ctx: { userId?: string | null; userRole?: string | null }) {
  return { viewer: await getViewerAccess({ userId: ctx.userId, role: ctx.userRole }) };
}

function buildMessageContextLink(message: MessageRecord, timestamp: string | null) {
  const chatId = String(message.chat_id);
  const messageId = String(message.message_id);
  const params = new URLSearchParams();
  const bucket = message.bucket ?? formatMessageBucket(timestamp);
  if (bucket) params.set("bucket", String(bucket));
  if (timestamp) params.set("timestamp", timestamp);
  const query = params.toString();
  return query ? `/lookup/message/${chatId}/${messageId}?${query}` : `/lookup/message/${chatId}/${messageId}`;
}

function messageRowKey(message: MessageRecord) {
  return `${String(message.chat_id)}:${String(message.message_id)}`;
}

function hasMessageTextContent(message: MessageRecord) {
  return String(message.content ?? "").trim().length > 0;
}

function appendUniqueMessageRows(target: MessageRecord[], seen: Set<string>, rows: MessageRecord[]) {
  let added = 0;
  for (const row of rows) {
    if (!hasMessageTextContent(row)) {
      continue;
    }
    const key = messageRowKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      target.push(row);
      added += 1;
    }
  }
  return added;
}

function sortMessagesNewestFirst(rows: MessageRecord[]) {
  return rows.sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  });
}

function getBucketsForParticipation(meta: ParticipationMetaRecord, explicitBucket: string | undefined, fallbackBuckets: string[]) {
  if (explicitBucket) {
    return [explicitBucket];
  }

  const historicalBuckets = buildBucketsBetweenDescending(
    meta.first_message_at ?? meta.last_message_at,
    meta.last_message_at ?? meta.first_message_at
  );

  return historicalBuckets.length > 0 ? historicalBuckets : fallbackBuckets;
}

function logUserMessageFallbackFailure(source: "messages_by_chat" | "messages_by_id", userId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[lookup.getUserMessages] supplemental ${source} lookup failed for user ${userId}: ${message}`);
}

async function buildLookupMessageFromUserRow(
  message: MessageRecord,
  searchCtx: Awaited<ReturnType<typeof buildViewer>>
): Promise<z.infer<typeof LookupMessageSchema>> {
  const chatId = String(message.chat_id);
  const messageId = String(message.message_id);
  const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : null;
  const chat = await getChatById(chatId);
  const targetType = chat?.chat_type === "channel" ? "channel" : "group";
  const chatRedaction = chat ? await loadSingleRedaction(targetType, chatId) : null;
  const redactedFields = new Set(chatRedaction?.fields ?? []);
  const hideMessage =
    (chatRedaction?.type === "full" || chatRedaction?.type === "masked" || redactedFields.has("messages"))
    && !searchCtx.viewer.canBypassRedactions;
  const content = hideMessage ? "[redacted]" : String(message.content ?? "");

  return {
    messageId,
    chatId,
    timestamp,
    content,
    highlightedSnippet: content,
    hasMedia: message.has_media ?? Boolean(message.media_type || message.media_url),
    containsLinks: /https?:\/\/|www\./i.test(content),
    sender: {
      userId: message.user_id ?? null,
      username: null,
      displayName: null,
    },
    chat: {
      chatId,
      title: chatRedaction?.type === "masked" && !searchCtx.viewer.canBypassRedactions
        ? "Record unavailable"
        : chat?.display_name ?? null,
      type: chat?.chat_type ?? null,
      username: redactedFields.has("username") && !searchCtx.viewer.canBypassRedactions
        ? null
        : chat?.username ?? null,
    },
    contextLink: buildMessageContextLink(message, timestamp),
    redaction: buildRedactionMetadata(chatRedaction),
  };
}

function maskHistoryValue(field: string, value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (["phone", "phone_number", "phone_hash", "phone_masked"].includes(field)) {
    return maskPhoneNumber(value) ?? "[redacted]";
  }

  return value;
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

function getFirstAndLastSeen(records: HistoryRecordLight[], fallbackCreatedAt: Date | null): { firstSeen: string | null; lastSeen: string | null } {
  if (records.length === 0) {
    return {
      firstSeen: fallbackCreatedAt?.toISOString() ?? null,
      lastSeen: fallbackCreatedAt?.toISOString() ?? null,
    };
  }

  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const record of records) {
    const date = record.changed_at instanceof Date ? record.changed_at : new Date(record.changed_at);
    if (!earliest || date < earliest) {
      earliest = date;
    }
    if (!latest || date > latest) {
      latest = date;
    }
  }

  return {
    firstSeen: earliest?.toISOString() ?? null,
    lastSeen: latest?.toISOString() ?? null,
  };
}

export const lookupRouter = router({
  getUser: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUser", protect: true } })
    .input(z.object({ userId: z.string() }))
    .output(LookupUserSchema.nullable())
    .query(async ({ ctx, input }) => {
      const user = await getUserById(input.userId);
      if (!user) {
        return null;
      }

      const viewer = await buildViewer(ctx);
      const redaction = await loadSingleRedaction("user", input.userId);

      if (redaction?.type === "full" && !viewer.viewer.canBypassRedactions) {
        return null;
      }

      const tracking = viewer.viewer.userId
        ? await getTrackingByProfile(viewer.viewer.userId, input.userId)
        : null;

      const historyMap = await getUserHistoryForBatch([input.userId]);
      const historyRecords = historyMap.get(input.userId) || [];
      const historyDisplayName = getLatestHistoryValue(historyRecords, "display_name");
      const historyBio = getLatestHistoryValue(historyRecords, "bio");
      const { firstSeen, lastSeen } = getFirstAndLastSeen(historyRecords, user.created_at);

      const result = {
        telegramUserId: user.user_id,
        username: user.username ?? null,
        displayName: historyDisplayName ?? user.display_name ?? null,
        profilePhoto: toApiServedAssetUrl(user.avatar_url),
        bio: historyBio ?? user.bio ?? null,
        premiumStatus: (user as any).is_premium ?? null,
        trackingStatus: tracking?.status ?? null,
        firstSeen,
        lastSeen,
        redaction: buildRedactionMetadata(redaction),
      };

      const canAccessFullProfile = await canUseProfileFullAccess(viewer.viewer.userId, ctx.userRole);
      if (!canAccessFullProfile && !viewer.viewer.canBypassRedactions) {
        result.bio = null;
      }

      const applied = applyResolvedRedaction(result, redaction, viewer.viewer);

      return applied as typeof result | null;
    }),

  getUserByUsername: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserByUsername", protect: true } })
    .input(z.object({ username: z.string() }))
    .output(LookupUserSchema.nullable())
    .query(async ({ ctx, input }) => {
      const username = input.username.replace(/^@/, "").toLowerCase();
      const user = await getUserByUsername(username);
      if (!user) {
        return null;
      }

      const viewer = await buildViewer(ctx);
      const redaction = await loadSingleRedaction("user", user.user_id);

      if (redaction?.type === "full" && !viewer.viewer.canBypassRedactions) {
        return null;
      }

      const tracking = viewer.viewer.userId
        ? await getTrackingByProfile(viewer.viewer.userId, user.user_id)
        : null;

      const historyMap = await getUserHistoryForBatch([user.user_id]);
      const historyRecords = historyMap.get(user.user_id) || [];
      const historyDisplayName = getLatestHistoryValue(historyRecords, "display_name");
      const historyBio = getLatestHistoryValue(historyRecords, "bio");
      const { firstSeen, lastSeen } = getFirstAndLastSeen(historyRecords, user.created_at);

      const result = {
        telegramUserId: user.user_id,
        username: user.username ?? null,
        displayName: historyDisplayName ?? user.display_name ?? null,
        profilePhoto: toApiServedAssetUrl(user.avatar_url),
        bio: historyBio ?? user.bio ?? null,
        premiumStatus: (user as any).is_premium ?? null,
        trackingStatus: tracking?.status ?? null,
        firstSeen,
        lastSeen,
        redaction: buildRedactionMetadata(redaction),
      };

      const canAccessFullProfile = await canUseProfileFullAccess(viewer.viewer.userId, ctx.userRole);
      if (!canAccessFullProfile && !viewer.viewer.canBypassRedactions) {
        result.bio = null;
      }

      return applyResolvedRedaction(result, redaction, viewer.viewer) as typeof result | null;
    }),

  getChat: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getChat", protect: true } })
    .input(z.object({ chatId: z.string() }))
    .output(LookupChatSchema.nullable())
    .query(async ({ ctx, input }) => {
      const chat = await getChatById(input.chatId);
      if (!chat) {
        return null;
      }

      const viewer = await buildViewer(ctx);
      const targetType = chat.chat_type === "channel" ? "channel" : "group";
      const redaction = await loadSingleRedaction(targetType, input.chatId);

      if (redaction?.type === "full" && !viewer.viewer.canBypassRedactions) {
        return null;
      }

      const result = {
        telegramChatId: chat.chat_id,
        title: chat.display_name ?? null,
        username: chat.username ?? null,
        description: chat.bio ?? null,
        profilePhoto: toApiServedAssetUrl(chat.avatar_url),
        chatType: chat.chat_type ?? null,
        subscriberCount: chat.member_count ?? chat.participants_count ?? null,
        participantCount: chat.participants_count ?? null,
        publicIndicator: chat.username ? "public" as const : "private" as const,
        createdAt: chat.created_at?.toISOString() ?? null,
        updatedAt: chat.updated_at?.toISOString() ?? null,
        redaction: buildRedactionMetadata(redaction),
      };

      return applyResolvedRedaction(result, redaction, viewer.viewer) as typeof result | null;
    }),

  getMessages: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getMessages", protect: true } })
    .input(z.object({
      chatId: z.string(),
      bucket: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }))
    .output(LookupMessagesResponseSchema)
    .query(async ({ ctx, input }) => {
      const searchCtx = await buildViewer(ctx);
      const canAccessMessages = await canUseMessageSearch(searchCtx.viewer.userId, ctx.userRole);
      if (!canAccessMessages) {
        return { items: [], nextCursor: null };
      }

      const offset = parseCursor(input.cursor);
      const buckets = input.bucket ? [input.bucket] : buildRecentBuckets(12);
      const targetCount = Math.min(200, offset + input.limit + 1);
      const rows: Awaited<ReturnType<typeof listMessagesByChatBucket>> = [];

      for (const bucket of buckets) {
        if (rows.length >= targetCount) break;
        const chunk = await listMessagesByChatBucket(input.chatId, bucket, targetCount - rows.length);
        if (chunk.length > 0) {
          rows.push(...chunk);
        }
      }
      const page = rows.slice(offset, offset + input.limit + 1);

      const items = (await Promise.all(
        page.slice(0, input.limit).map((message) =>
          getLookupMessage(String(message.chat_id), String(message.message_id), searchCtx, {
            bucket: message.bucket ?? null,
            timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : null,
          })
        )
      )).filter(Boolean) as z.infer<typeof LookupMessageSchema>[];

      return {
        items,
        nextCursor: page.length > input.limit ? String(offset + input.limit) : null,
      };
    }),

  getUserMessages: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserMessages", protect: true } })
    .input(z.object({
      userId: z.string(),
      bucket: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }))
    .output(LookupMessagesResponseSchema)
    .query(async ({ ctx, input }) => {
      const searchCtx = await buildViewer(ctx);
      const canAccessMessages = await canUseMessageSearch(searchCtx.viewer.userId, ctx.userRole);
      if (!canAccessMessages) {
        return { items: [], nextCursor: null, unavailableReason: "message_access_required" as const };
      }

      const userRedaction = await loadSingleRedaction("user", input.userId);
      const userRedactedFields = new Set(userRedaction?.fields ?? []);
      const messagesRedacted =
        (userRedaction?.type === "full" || userRedaction?.type === "masked" || userRedactedFields.has("messages"))
        && !searchCtx.viewer.canBypassRedactions;

      if (messagesRedacted) {
        return { items: [], nextCursor: null, unavailableReason: "redacted" as const };
      }

      const offset = parseCursor(input.cursor);
      const buckets = input.bucket ? [input.bucket] : buildAllBucketsDescending();
      const targetCount = Math.min(200, offset + input.limit + 1);
      const rows: MessageRecord[] = [];
      const seenRows = new Set<string>();
      let userSourceCount = 0;

      for (const bucket of buckets) {
        if (userSourceCount >= targetCount) break;
        const chunk = await listMessagesByUserBucket(input.userId, bucket, targetCount - userSourceCount);
        if (chunk.length > 0) {
          userSourceCount += appendUniqueMessageRows(rows, seenRows, chunk);
        }
      }

      if (rows.length < targetCount) {
        const participation = await getParticipationMetaByUser(input.userId);
        let chatSourceCount = 0;
        for (const meta of participation) {
          const chatBuckets = getBucketsForParticipation(meta, input.bucket, buckets);
          for (const bucket of chatBuckets) {
            if (chatSourceCount >= targetCount || rows.length >= targetCount) break;
            try {
              const chunk = await listMessagesByChatBucketForUser(
                meta.chat_id,
                bucket,
                input.userId,
                targetCount - chatSourceCount
              );
              if (chunk.length > 0) {
                chatSourceCount += appendUniqueMessageRows(rows, seenRows, chunk);
              }
            } catch (error) {
              logUserMessageFallbackFailure("messages_by_chat", input.userId, error);
              chatSourceCount = targetCount;
              break;
            }
          }
          if (chatSourceCount >= targetCount || rows.length >= targetCount) break;
        }
      }

      if (rows.length < targetCount) {
        try {
          const idRows = await listMessagesByIdForUser(input.userId, targetCount);
          if (idRows.length > 0) {
            appendUniqueMessageRows(rows, seenRows, idRows);
          }
        } catch (error) {
          logUserMessageFallbackFailure("messages_by_id", input.userId, error);
        }
      }

      if (rows.length > 1) {
        sortMessagesNewestFirst(rows);
        if (rows.length > targetCount) {
          rows.length = targetCount;
        }
      }
      const page = rows.slice(offset, offset + input.limit + 1);

      const items = (await Promise.all(
        page.slice(0, input.limit).map((message) => buildLookupMessageFromUserRow(message, searchCtx))
      ));

      return {
        items,
        nextCursor: page.length > input.limit ? String(offset + input.limit) : null,
      };
    }),

  getMessage: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getMessage", protect: true } })
    .input(z.object({
      chatId: z.string(),
      messageId: z.string(),
      bucket: z.string().optional(),
      timestamp: z.string().optional(),
    }))
    .output(LookupMessageSchema.nullable())
    .query(async ({ ctx, input }) => {
      const searchCtx = await buildViewer(ctx);
      const canAccessMessages = await canUseMessageSearch(searchCtx.viewer.userId, ctx.userRole);
      if (!canAccessMessages) {
        return null;
      }
      return getLookupMessage(input.chatId, input.messageId, searchCtx, {
        bucket: input.bucket ?? null,
        timestamp: input.timestamp ?? null,
      });
    }),

  getUserHistory: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserHistory", protect: true } })
    .input(z.object({ userId: z.string() }))
    .output(UserHistoryResponseSchema)
    .query(async ({ ctx, input }) => {
      const { viewer } = await buildViewer(ctx);

      const redaction = await loadSingleRedaction("user", input.userId);

      if (redaction?.type === "full" && !viewer.canBypassRedactions) {
        return {
          displayNameHistory: [],
          usernameHistory: [],
          bioHistory: [],
          phoneHistory: [],
        };
      }

      if (redaction?.type === "masked" && !viewer.canBypassRedactions) {
        return {
          displayNameHistory: [],
          usernameHistory: [],
          bioHistory: [],
          phoneHistory: [],
        };
      }

      const history = await getUserHistory(input.userId);

      let displayNameHistory: Array<{ oldValue: string | null; newValue: string | null; changedAt: string | null }> = [];
      let usernameHistory: Array<{ oldValue: string | null; newValue: string | null; changedAt: string | null }> = [];
      let bioHistory: Array<{ oldValue: string | null; newValue: string | null; changedAt: string | null }> = [];
      let phoneHistory: Array<{ oldValue: string | null; newValue: string | null; changedAt: string | null }> = [];

      for (const row of history) {
        const entry = {
          oldValue: maskHistoryValue(row.field, row.old_value ?? null),
          newValue: maskHistoryValue(row.field, row.new_value ?? null),
          changedAt: row.changed_at ? new Date(row.changed_at).toISOString() : null,
        };

        switch (row.field) {
          case "display_name":
            displayNameHistory.push(entry);
            break;
          case "username":
            usernameHistory.push(entry);
            break;
          case "bio":
            bioHistory.push(entry);
            break;
          case "phone":
          case "phone_number":
          case "phone_hash":
          case "phone_masked":
            phoneHistory.push(entry);
            break;
        }
      }

      const fields = new Set(redaction?.fields ?? []);

      if (fields.has("username")) {
        usernameHistory = usernameHistory.map(h => ({ ...h, oldValue: null, newValue: null }));
      }
      if (fields.has("displayName")) {
        displayNameHistory = displayNameHistory.map(h => ({ ...h, oldValue: null, newValue: null }));
      }
      if (fields.has("bio")) {
        bioHistory = bioHistory.map(h => ({ ...h, oldValue: null, newValue: null }));
      }

      return { displayNameHistory, usernameHistory, bioHistory, phoneHistory };
    }),

  getUserChats: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserChats", protect: true } })
    .input(z.object({ userId: z.string() }))
    .output(z.array(ChatActivityEntrySchema))
    .query(async ({ ctx, input }) => {
      const { viewer } = await buildViewer(ctx);

      const userRedaction = await loadSingleRedaction("user", input.userId);

      if ((userRedaction?.type === "full" || userRedaction?.type === "masked") && !viewer.canBypassRedactions) {
        return [];
      }

      const participation = await getParticipationByUser(input.userId);
      if (participation.length === 0) {
        return [];
      }

      const chatIds = participation.map((item) => item.chat_id);
      const chats = await listChatsByIds(chatIds);
      const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));

      const channelChats = chats.filter(c => c.chat_type === "channel").map(c => c.chat_id);
      const groupChats = chats.filter(c => c.chat_type !== "channel").map(c => c.chat_id);

      const [channelRedactions, groupRedactions] = await Promise.all([
        channelChats.length > 0 ? loadRedactionMap("channel", channelChats) : new Map(),
        groupChats.length > 0 ? loadRedactionMap("group", groupChats) : new Map(),
      ]);

      const userRedactedFields = new Set(userRedaction?.fields ?? []);

      return participation.map((item) => {
        const chat = chatMap.get(item.chat_id);

        const chatRedaction = chat
          ? (chat.chat_type === "channel"
              ? channelRedactions.get(item.chat_id)
              : groupRedactions.get(item.chat_id))
          : null;

        const mergedFields = new Set([
          ...userRedactedFields,
          ...(chatRedaction?.fields ?? []),
        ]);

        const hasFullRedaction = (userRedaction?.type === "full" || chatRedaction?.type === "full" || chatRedaction?.type === "masked") && !viewer.canBypassRedactions;
        if (hasFullRedaction) {
          return {
            chatId: item.chat_id,
            chatName: chatRedaction?.type === "masked" ? "Record unavailable" : "[redacted]",
            username: null,
            chatType: chat?.chat_type ?? null,
            firstMessageAt: null,
            lastMessageAt: null,
            messageCount: item.message_count,
          };
        }

        let chatName = chat?.display_name ?? null;
        let username = chat?.username ?? null;

        if (mergedFields.has("displayName")) {
          chatName = "[redacted]";
        }
        if (mergedFields.has("username")) {
          username = null;
        }

        return {
          chatId: item.chat_id,
          chatName,
          username,
          chatType: chat?.chat_type ?? null,
          firstMessageAt: null,
          lastMessageAt: null,
          messageCount: item.message_count,
        };
      });
    }),
});
