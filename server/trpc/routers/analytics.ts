import { router } from "../init";
import { z } from "zod";
import { getCassandraClient, getUserWordStats, getChatWordStats, getParticipationMetaByUser } from "../../lib/tg-queries/queries";
import { searchModeProcedure, getSearchViewerRole } from "../../lib/tg-queries/searchModeProcedure";

const cassandra = () => getCassandraClient();

const STOP_WORDS = new Set([
  "the", "and", "is", "in", "it", "to", "of", "a", "an", "for", "on", "with",
  "at", "by", "this", "that", "from", "or", "but", "not", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "can", "shall", "i", "you", "he",
  "she", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "its", "our", "their", "what", "which", "who", "whom", "so", "if", "then",
  "than", "too", "very", "just", "about", "up", "out", "no", "yes", "all",
]);

function filterTopWords(rows: Array<{ word: string; count: number }>) {
  return rows
    .filter((row) => row.word && !STOP_WORDS.has(row.word.toLowerCase()))
    .sort((left, right) => right.count - left.count)
    .slice(0, 50);
}

const MOCK_USER_ANALYTICS: Record<string, { activeChats: { chat_id: string; first_message_at: string; last_message_at: string }[]; frequentWords: { word: string; count: number }[] }> = {
  "1234567890": {
    activeChats: [
      { chat_id: "9876543210", first_message_at: "2024-01-15T10:00:00Z", last_message_at: "2024-04-19T15:30:00Z" },
      { chat_id: "5555555555", first_message_at: "2024-02-20T08:00:00Z", last_message_at: "2024-04-18T20:45:00Z" },
    ],
    frequentWords: [
      { word: "react", count: 245 },
      { word: "typescript", count: 189 },
      { word: "github", count: 156 },
      { word: "api", count: 134 },
      { word: "docker", count: 98 },
      { word: "kubernetes", count: 87 },
      { word: "graphql", count: 76 },
      { word: "nodejs", count: 65 },
    ],
  },
};

const MOCK_CHAT_ANALYTICS: Record<string, { topWords: { word: string; count: number }[] }> = {
  "9876543210": {
    topWords: [
      { word: "ai", count: 1234 },
      { word: "tech", count: 987 },
      { word: "google", count: 876 },
      { word: "apple", count: 765 },
      { word: "microsoft", count: 654 },
      { word: "startup", count: 543 },
      { word: "crypto", count: 432 },
      { word: "robotics", count: 321 },
    ],
  },
};

export const analyticsRouter = router({
  getActiveChats: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getActiveChats", protect: true } })
    .input(z.object({ region: z.string().optional() }))
    .output(z.unknown())
    .query(async ({ input: parsed }) => {
      return { stats: [], region: parsed.region ?? "global" };
    }),

  getFrequentWords: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getFrequentWords", protect: true } })
    .input(z.object({ scope: z.string() }))
    .output(z.unknown())
    .query(async ({ input: parsed }) => {
      const [scopeType, scopeId] = parsed.scope.includes(":") ? parsed.scope.split(":", 2) : ["user", parsed.scope];
      if (!scopeId) {
        return { words: [] };
      }

      let words: { word: string; count: number }[] = [];
      try {
        if (scopeType === "chat") {
          words = await getChatWordStats(scopeId, 100);
        } else {
          words = await getUserWordStats(scopeId, 100);
        }
      } catch {
        // Fall back to mock data
        if (scopeType === "chat") {
          words = MOCK_CHAT_ANALYTICS[scopeId]?.topWords || [];
        } else {
          words = MOCK_USER_ANALYTICS[scopeId]?.frequentWords || [];
        }
      }
      return { words: filterTopWords(words) };
    }),

  getTopEntities: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getTopEntities", protect: true } })
    .input(z.object({ entityType: z.enum(["groups", "channels"]) }))
    .output(z.unknown())
    .query(async ({ input: parsed }) => {
      return { top: [], entityType: parsed.entityType };
    }),

  getUserAnalytics: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getUserAnalytics", protect: true } })
    .input(z.object({
      userId: z.string(),
      bucket: z.string().optional(),
    }))
    .output(z.object({
      userId: z.string(),
      bucket: z.string(),
      activeChats: z.array(z.unknown()),
      frequentWords: z.array(z.unknown()),
    }))
    .query(async ({ input: parsed }) => {
      const bucket = parsed.bucket ?? new Date().toISOString().slice(0, 7).replace("-", "");

      let participation: { chat_id: string; first_message_at?: Date; last_message_at?: Date }[] = [];
      let wordStats: { word: string; count: number }[] = [];

      try {
        participation = await getParticipationMetaByUser(parsed.userId);
        wordStats = await getUserWordStats(parsed.userId, 100);
      } catch {
        const mock = MOCK_USER_ANALYTICS[parsed.userId];
        if (mock) {
          return {
            userId: parsed.userId,
            bucket,
            activeChats: mock.activeChats,
            frequentWords: mock.frequentWords,
          };
        }
        return {
          userId: parsed.userId,
          bucket,
          activeChats: [],
          frequentWords: [],
        };
      }

      const activeChats = participation.map(p => ({
        chat_id: p.chat_id,
        first_message_at: p.first_message_at ?? null,
        last_message_at: p.last_message_at ?? null,
      }));

      return {
        userId: parsed.userId,
        bucket,
        activeChats,
        frequentWords: filterTopWords(wordStats),
      };
    }),

  getChatAnalytics: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getChatAnalytics", protect: true } })
    .input(z.object({
      chatId: z.string(),
      bucket: z.string().optional(),
    }))
    .output(z.object({
      chatId: z.string(),
      bucket: z.string(),
      topWords: z.array(z.unknown()),
    }))
    .query(async ({ input: parsed }) => {
      const bucket = parsed.bucket ?? new Date().toISOString().slice(0, 7).replace("-", "");
      let wordStats: { word: string; count: number }[] = [];

      try {
        wordStats = await getChatWordStats(parsed.chatId, 100);
      } catch {
        const mock = MOCK_CHAT_ANALYTICS[parsed.chatId];
        if (mock) {
          return {
            chatId: parsed.chatId,
            bucket,
            topWords: mock.topWords,
          };
        }
        return {
          chatId: parsed.chatId,
          bucket,
          topWords: [],
        };
      }

      return {
        chatId: parsed.chatId,
        bucket,
        topWords: filterTopWords(wordStats),
      };
    }),

  getGlobalStats: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/getGlobalStats", protect: true } })
    .input(z.object({ bucket: z.string().optional() }).default({}))
    .output(z.unknown())
    .query(async ({ input: parsed }) => {
      const _bucket = parsed.bucket ?? new Date().toISOString().slice(0, 7).replace("-", "");
      const result = await cassandra().execute("SELECT * FROM global_stats");
      return result.rows;
    }),
});
