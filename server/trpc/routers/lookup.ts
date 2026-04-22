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
  getParticipationByUser,
  listChatsByIds,
  listMessagesByChatBucket,
  listMessagesByUserBucket,
  type HistoryRecordLight,
} from "../../lib/tg-queries/queries";
import { searchModeProcedure } from "../../lib/tg-queries/searchModeProcedure";
import { canUseMessageSearch, canUseProfileFullAccess, getViewerAccess } from "../../lib/tg-queries/viewer";
import { buildRedactionMetadata, loadSingleRedaction, loadRedactionMap, applyResolvedRedaction } from "../../lib/tg-queries/redactions";
import { toApiServedAssetUrl } from "../../lib/tg-queries/storageAssets";
import { getTrackingByProfile } from "../../lib/db/tracking";
import { maskPhoneNumber } from "../../lib/tg-queries/phone";
import { getLookupMessage } from "../../lib/tg-queries/searchService";

function currentBucket() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildRecentBuckets(monthsBack: number = 12) {
  const buckets: string[] = [];
  const now = new Date();
  for (let offset = 0; offset < monthsBack; offset += 1) {
    const point = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    buckets.push(`${point.getUTCFullYear()}${String(point.getUTCMonth() + 1).padStart(2, "0")}`);
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
        return { items: [], nextCursor: null };
      }

      const offset = parseCursor(input.cursor);
      const buckets = input.bucket ? [input.bucket] : buildRecentBuckets(12);
      const targetCount = Math.min(200, offset + input.limit + 1);
      const rows: Awaited<ReturnType<typeof listMessagesByUserBucket>> = [];

      for (const bucket of buckets) {
        if (rows.length >= targetCount) break;
        const chunk = await listMessagesByUserBucket(input.userId, bucket, targetCount - rows.length);
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
