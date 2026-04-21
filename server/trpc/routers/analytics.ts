import { router } from "../init";
import { z } from "zod";
import { UserAnalyticsSchema } from "../../../shared/api";
import {
  getChatById,
  getChatWordStats,
  getParticipationByUser,
  getParticipationMetaByUser,
  getUserWordStats,
  listChatsByIds,
} from "../../lib/tg-queries/queries";
import { searchModeProcedure } from "../../lib/tg-queries/searchModeProcedure";
import { getViewerAccess } from "../../lib/tg-queries/viewer";
import { loadSingleRedaction } from "../../lib/tg-queries/redactions";

const STOP_WORDS = new Set([
  "the", "and", "is", "in", "it", "to", "of", "a", "an", "for", "on", "with",
  "at", "by", "this", "that", "from", "or", "but", "not", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "can", "shall", "i", "you", "he",
  "she", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "its", "our", "their", "what", "which", "who", "whom", "so", "if", "then",
  "than", "too", "very", "just", "about", "up", "out", "no", "yes", "all",
]);

function currentBucket() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function filterTopWords(rows: Array<{ word: string; count: number }>) {
  return rows
    .filter((row) => row.word && !STOP_WORDS.has(row.word.toLowerCase()))
    .sort((left, right) => right.count - left.count)
    .slice(0, 50);
}

async function buildUserAnalyticsData(
  userId: string,
  viewerUserId: string | null,
  viewerRole: string | null,
  bucket?: string,
) {
  const viewer = await getViewerAccess({ userId: viewerUserId, role: viewerRole });
  const userRedaction = await loadSingleRedaction("user", userId);
  if (userRedaction?.type === "full" && !viewer.canBypassRedactions) {
    return {
      userId: null,
      bucket: bucket ?? currentBucket(),
      activeChats: [],
      frequentWords: [],
      groups: [],
      channels: [],
    };
  }

  const [participationCounts, participationMeta, wordStats] = await Promise.all([
    getParticipationByUser(userId),
    getParticipationMetaByUser(userId),
    getUserWordStats(userId, 100),
  ]);

  const chatIds = Array.from(new Set([
    ...participationCounts.map((item) => item.chat_id),
    ...participationMeta.map((item) => item.chat_id),
  ]));
  const chats = await listChatsByIds(chatIds);
  const chatMap = new Map(chats.map((chat) => [chat.chat_id, chat]));
  const metaMap = new Map(participationMeta.map((item) => [item.chat_id, item]));
  const countMap = new Map(participationCounts.map((item) => [item.chat_id, item.message_count]));

  const activeChats = chatIds.map((chatId) => {
    const chat = chatMap.get(chatId);
    const meta = metaMap.get(chatId);
    return {
      chatId,
      chatName: chat?.display_name ?? null,
      username: chat?.username ?? null,
      chatType: chat?.chat_type ?? null,
      firstMessageAt: meta?.first_message_at ? new Date(meta.first_message_at).toISOString() : null,
      lastMessageAt: meta?.last_message_at ? new Date(meta.last_message_at).toISOString() : null,
      messageCount: Number(countMap.get(chatId) ?? 0),
    };
  }).sort((left, right) => right.messageCount - left.messageCount);

  const groups = activeChats.filter((chat) => chat.chatType === "group" || chat.chatType === "supergroup");
  const channels = activeChats.filter((chat) => chat.chatType === "channel");

  const frequentWords = filterTopWords(wordStats);
  const redactedFields = new Set(userRedaction?.fields ?? []);
  const hideMessages = redactedFields.has("messages");
  const hideGroups = redactedFields.has("groups");
  const hideChannels = redactedFields.has("channels");

  return {
    userId,
    bucket: bucket ?? currentBucket(),
    activeChats: hideMessages ? [] : activeChats,
    frequentWords: hideMessages ? [] : frequentWords,
    groups: hideGroups || hideMessages ? [] : groups,
    channels: hideChannels || hideMessages ? [] : channels,
  };
}

export const analyticsRouter = router({
  getFrequentWords: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getFrequentWords", protect: true } })
    .input(z.object({ scope: z.string() }))
    .output(z.object({ words: z.array(z.object({ word: z.string(), count: z.number() })) }))
    .query(async ({ ctx, input }) => {
      const [scopeType, scopeId] = input.scope.includes(":") ? input.scope.split(":", 2) : ["user", input.scope];
      if (!scopeId) {
        return { words: [] };
      }

      const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });

      if (scopeType === "user" || scopeType === "userId") {
        const userRedaction = await loadSingleRedaction("user", scopeId);
        if (userRedaction?.type === "full" && !viewer.canBypassRedactions) {
          return { words: [] };
        }
        const fields = new Set(userRedaction?.fields ?? []);
        if (fields.has("messages")) {
          return { words: [] };
        }
      } else if (scopeType === "chat") {
        const chat = await getChatById(scopeId);
        if (chat) {
          const targetType = chat.chat_type === "channel" ? "channel" : "group";
          const chatRedaction = await loadSingleRedaction(targetType, scopeId);
          if (chatRedaction?.type === "full" && !viewer.canBypassRedactions) {
            return { words: [] };
          }
          const fields = new Set(chatRedaction?.fields ?? []);
          if (fields.has("messages")) {
            return { words: [] };
          }
        }
      }

      const words = scopeType === "chat"
        ? await getChatWordStats(scopeId, 100)
        : await getUserWordStats(scopeId, 100);

      return { words: filterTopWords(words) };
    }),

  getUserAnalytics: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getUserAnalytics", protect: true } })
    .input(z.object({
      userId: z.string(),
      bucket: z.string().optional(),
    }))
    .output(UserAnalyticsSchema)
    .query(async ({ ctx, input }) => buildUserAnalyticsData(input.userId, ctx.userId, ctx.userRole, input.bucket)),

  getChatAnalytics: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getChatAnalytics", protect: true } })
    .input(z.object({
      chatId: z.string(),
      bucket: z.string().optional(),
    }))
    .output(z.object({
      chatId: z.string(),
      bucket: z.string(),
      topWords: z.array(z.object({ word: z.string(), count: z.number() })),
    }))
    .query(async ({ ctx, input }) => {
      const chat = await getChatById(input.chatId);
      const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });

      if (chat) {
        const targetType = chat.chat_type === "channel" ? "channel" : "group";
        const chatRedaction = await loadSingleRedaction(targetType, input.chatId);
        if (chatRedaction?.type === "full" && !viewer.canBypassRedactions) {
          return {
            chatId: input.chatId,
            bucket: input.bucket ?? currentBucket(),
            topWords: [],
          };
        }
        const fields = new Set(chatRedaction?.fields ?? []);
        if (fields.has("messages")) {
          return {
            chatId: input.chatId,
            bucket: input.bucket ?? currentBucket(),
            topWords: [],
          };
        }
      }

      const wordStats = await getChatWordStats(input.chatId, 100);
      return {
        chatId: input.chatId,
        bucket: input.bucket ?? currentBucket(),
        topWords: filterTopWords(wordStats),
      };
    }),

  getTopEntities: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getTopEntities", protect: true } })
    .input(z.object({ entityType: z.enum(["groups", "channels"]), userId: z.string() }))
    .output(z.object({ top: z.array(z.object({ chatId: z.string(), chatName: z.string().nullable(), messageCount: z.number() })) }))
    .query(async ({ ctx, input }) => {
      const result = await buildUserAnalyticsData(input.userId, ctx.userId, ctx.userRole);
      const source = input.entityType === "groups" ? result.groups : result.channels;
      return {
        top: source.slice(0, 20).map((item) => ({
          chatId: item.chatId,
          chatName: item.chatName,
          messageCount: item.messageCount,
        })),
      };
    }),
});
