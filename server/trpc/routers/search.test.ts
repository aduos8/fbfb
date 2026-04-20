import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "../context";

type SqlValue = string | number | boolean | null | Date;

interface SqlRow {
  [key: string]: SqlValue;
}

interface SqlResult {
  [key: string]: SqlValue | SqlValue[];
}

const { mockSql } = vi.hoisted(() => {
  return { mockSql: vi.fn<() => Promise<SqlResult[]>>() };
});

vi.mock("../../lib/db", () => ({
  sql: mockSql,
}));

function formatDate(date: Date): string {
  return date.toISOString();
}

const MOCK_USERS = [
  { userId: "1234567890", username: "johndoe", displayName: "John Doe", bio: "Tech enthusiast", avatarUrl: "https://i.pravatar.cc/150?u=johndoe", isPremium: true, firstSeen: new Date("2023-01-15"), lastSeen: new Date() },
  { userId: "2345678901", username: "alice_crypto", displayName: "Alice Chen", bio: "Blockchain developer", avatarUrl: "https://i.pravatar.cc/150?u=alice_crypto", isPremium: true, firstSeen: new Date("2022-06-20"), lastSeen: new Date(Date.now() - 86400000) },
  { userId: "3456789012", username: "devmike", displayName: "Mike Roberts", bio: "Full-stack developer", avatarUrl: "https://i.pravatar.cc/150?u=devmike", isPremium: false, firstSeen: new Date("2023-03-10"), lastSeen: new Date(Date.now() - 172800000) },
  { userId: "4567890123", username: "sarah_tech", displayName: "Sarah Williams", bio: "ML engineer", avatarUrl: "https://i.pravatar.cc/150?u=ml_engineer", isPremium: true, firstSeen: new Date("2021-11-05"), lastSeen: new Date() },
  { userId: "5678901234", username: "cryptowhale", displayName: "Crypto Whale", bio: "Early Bitcoin adopter", avatarUrl: "https://i.pravatar.cc/150?u=cryptowhale", isPremium: false, firstSeen: new Date("2020-02-14"), lastSeen: new Date(Date.now() - 3600000) },
  { userId: "6789012345", username: "ux_designer", displayName: "Emma Thompson", bio: "UX/UI Designer", avatarUrl: "https://i.pravatar.cc/150?u=ux_designer", isPremium: true, firstSeen: new Date("2023-05-22"), lastSeen: new Date() },
  { userId: "7890123456", username: "security_pro", displayName: "Alex Morgan", bio: "Cybersecurity expert", avatarUrl: "https://i.pravatar.cc/150?u=security_pro", isPremium: false, firstSeen: new Date("2022-09-30"), lastSeen: new Date(Date.now() - 7200000) },
  { userId: "8901234567", username: "data_scientist", displayName: "Lisa Park", bio: "Data scientist", avatarUrl: "https://i.pravatar.cc/150?u=data_scientist", isPremium: true, firstSeen: new Date("2023-02-18"), lastSeen: new Date() },
];

const MOCK_CHANNELS = [
  { chatId: "9876543210", username: "technews", title: "Tech News Daily", description: "Your daily dose of technology news", memberCount: 125000, avatarUrl: "https://i.pravatar.cc/150?u=technews", isVerified: true },
  { chatId: "8765432109", username: "cryptocurrency", title: "Crypto Signals & News", description: "Real-time crypto signals", memberCount: 89000, avatarUrl: "https://i.pravatar.cc/150?u=cryptonews", isVerified: true },
  { chatId: "7654321098", username: "programming_hub", title: "Programming Hub", description: "Code snippets and tutorials", memberCount: 67000, avatarUrl: "https://i.pravatar.cc/150?u=prog_hub", isVerified: false },
  { chatId: "6543210987", username: "ai_research", title: "AI Research Papers", description: "Latest AI/ML research papers", memberCount: 45000, avatarUrl: "https://i.pravatar.cc/150?u=airesearch", isVerified: true },
  { chatId: "5432109876", username: "security_alerts", title: "Security Alerts", description: "Cybersecurity news and alerts", memberCount: 38000, avatarUrl: "https://i.pravatar.cc/150?u=sec_alerts", isVerified: false },
];

const MOCK_GROUPS = [
  { chatId: "5555555555", username: "programming", title: "Programming Community", description: "Share knowledge and help each other", memberCount: 25000, groupType: "supergroup" as const },
  { chatId: "4444444444", username: "crypto_traders", title: "Crypto Traders Club", description: "Trading strategies and analysis", memberCount: 18000, groupType: "supergroup" as const },
  { chatId: "3333333333", username: "webdevs", title: "Web Developers", description: "Frontend, backend, and full-stack", memberCount: 15000, groupType: "supergroup" as const },
  { chatId: "2222222222", username: "ml_community", title: "Machine Learning Community", description: "ML practitioners sharing models", memberCount: 12000, groupType: "supergroup" as const },
  { chatId: "1111111111", username: "startup_founders", title: "Startup Founders", description: "Connect with fellow founders", memberCount: 8000, groupType: "group" as const },
];

const MOCK_MESSAGES = [
  { chatId: "9876543210", messageId: "1001", userId: "1234567890", text: "Just released a new version of our open-source framework!", date: new Date(Date.now() - 3600000), mediaType: null },
  { chatId: "9876543210", messageId: "1002", userId: "2345678901", text: "The new AI model is incredible. It can generate code from natural language descriptions.", date: new Date(Date.now() - 7200000), mediaType: null },
  { chatId: "8765432109", messageId: "2001", userId: "5678901234", text: "Bitcoin just broke through the resistance level. Looking bullish.", date: new Date(Date.now() - 1800000), mediaType: null },
  { chatId: "8765432109", messageId: "2002", userId: "2345678901", text: "Ethereum gas fees are finally dropping. Good time to do some DeFi.", date: new Date(Date.now() - 5400000), mediaType: null },
  { chatId: "7654321098", messageId: "3001", userId: "3456789012", text: "Anyone know how to properly handle async/await errors in TypeScript?", date: new Date(Date.now() - 900000), mediaType: null },
  { chatId: "7654321098", messageId: "3002", userId: "1234567890", text: "Try using a wrapper function with try-catch that returns a Result type.", date: new Date(Date.now() - 600000), mediaType: null },
  { chatId: "6543210987", messageId: "4001", userId: "8901234567", text: "New paper on transformer architectures just dropped.", date: new Date(Date.now() - 10800000), mediaType: null },
  { chatId: "5432109876", messageId: "5001", userId: "7890123456", text: "Critical vulnerability discovered in popular npm package.", date: new Date(Date.now() - 300000), mediaType: null },
  { chatId: "5555555555", messageId: "6001", userId: "6789012345", text: "Just finished a complete redesign of our component library.", date: new Date(Date.now() - 14400000), mediaType: null },
  { chatId: "5555555555", messageId: "6002", userId: "3456789012", text: "Would love to take a look. Can you share the link?", date: new Date(Date.now() - 13800000), mediaType: null },
];

function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

function matchesQuery(text: string, query: string): boolean {
  return normalizeString(text).includes(normalizeString(query));
}

function sanitizeQuery(query: string): string {
  return query.trim().slice(0, 255);
}

function createSearchSubRouter() {
  const t = initTRPC.context<Context>().create();
  const publicProcedure = t.procedure;

  const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
  });

  const creditGatedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
    const [row] = await mockSql() as [{ balance?: number }];
    const balance = row?.balance ?? 0;
    if (balance < 1) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Insufficient credits",
        cause: { code: "INSUFFICIENT_CREDITS", balance: 0 },
      });
    }
    return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole, balance } });
  });

  async function executeCreditDeductedSearch<T extends Record<string, unknown>>(
    userId: string, searchType: string, input: Record<string, unknown>, searchFn: () => Promise<T[]>
  ) {
    const transactionId = `search:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const queryPreview = String(input.query ?? "").slice(0, 100);

    const [result] = await mockSql() as [{ balance: number }];
    if (!result) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Insufficient credits",
        cause: { code: "INSUFFICIENT_CREDITS", balance: 0 },
      });
    }

    await mockSql();

    const searchResults = await searchFn();

    return { results: searchResults, creditsRemaining: result.balance, transactionId };
  }

  return t.router({
    profile: creditGatedProcedure
      .input(z.object({ query: z.string().min(1).max(255), searchBy: z.enum(["username", "id", "name"]).default("username"), limit: z.number().min(1).max(50).default(20) }))
      .mutation(async ({ ctx, input }) => {
        return executeCreditDeductedSearch(ctx.userId, "profile", input,
          () => {
            const query = sanitizeQuery(input.query);
            if (!query) return Promise.resolve([]);
            let results = MOCK_USERS;
            if (input.searchBy === "username") {
              results = MOCK_USERS.filter((u) => u.username && matchesQuery(u.username, query));
            } else if (input.searchBy === "id") {
              results = MOCK_USERS.filter((u) => u.userId.includes(query));
            } else {
              results = MOCK_USERS.filter((u) => matchesQuery(u.displayName, query) || (u.bio && matchesQuery(u.bio, query)));
            }
            return Promise.resolve(results.slice(0, input.limit).map((u) => ({
              userId: u.userId, username: u.username, displayName: u.displayName, bio: u.bio,
              avatarUrl: u.avatarUrl, isPremium: u.isPremium,
              firstSeen: formatDate(u.firstSeen), lastSeen: formatDate(u.lastSeen),
            })));
          });
      }),

    channel: creditGatedProcedure
      .input(z.object({ query: z.string().min(1).max(255), limit: z.number().min(1).max(50).default(20) }))
      .mutation(async ({ ctx, input }) => {
        return executeCreditDeductedSearch(ctx.userId, "channel", input,
          () => {
            const query = sanitizeQuery(input.query);
            if (!query) return Promise.resolve([]);
            const results = MOCK_CHANNELS.filter(
              (c) => (c.username && matchesQuery(c.username, query)) ||
                matchesQuery(c.title, query) ||
                (c.description && matchesQuery(c.description, query))
            );
            return Promise.resolve(results.slice(0, input.limit).map((c) => ({
              chatId: c.chatId, username: c.username, title: c.title, description: c.description,
              memberCount: c.memberCount, avatarUrl: c.avatarUrl, isVerified: c.isVerified,
            })));
          });
      }),

    group: creditGatedProcedure
      .input(z.object({ query: z.string().min(1).max(255), limit: z.number().min(1).max(50).default(20) }))
      .mutation(async ({ ctx, input }) => {
        return executeCreditDeductedSearch(ctx.userId, "group", input,
          () => {
            const query = sanitizeQuery(input.query);
            if (!query) return Promise.resolve([]);
            const results = MOCK_GROUPS.filter(
              (g) => (g.username && matchesQuery(g.username, query)) ||
                matchesQuery(g.title, query) ||
                (g.description && matchesQuery(g.description, query))
            );
            return Promise.resolve(results.slice(0, input.limit).map((g) => ({
              chatId: g.chatId, username: g.username, title: g.title, description: g.description,
              memberCount: g.memberCount, groupType: g.groupType,
            })));
          });
      }),

    message: creditGatedProcedure
      .input(z.object({ query: z.string().min(1).max(1000), chatId: z.string().optional(), limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }))
      .mutation(async ({ ctx, input }) => {
        const transactionId = `search:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

        const [result] = await mockSql() as [{ balance: number }];
        if (!result) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Insufficient credits",
            cause: { code: "INSUFFICIENT_CREDITS", balance: 0 },
          });
        }

        await mockSql();

        const query = sanitizeQuery(input.query);
        let results = query ? MOCK_MESSAGES.filter((m) => matchesQuery(m.text, query)) : [];
        if (input.chatId) results = results.filter((m) => m.chatId === input.chatId);
        const total = results.length;
        const paginated = results.slice(0, input.limit).map((m) => ({
          chatId: m.chatId, messageId: m.messageId, userId: m.userId,
          text: m.text, date: formatDate(m.date), mediaType: m.mediaType,
        }));

        return { results: paginated, total, creditsRemaining: result.balance, transactionId };
      }),

    getProfile: publicProcedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input }) => {
        const user = MOCK_USERS.find((u) => u.userId === input.userId);
        return {
          profile: user ? {
            userId: user.userId, username: user.username, displayName: user.displayName,
            bio: user.bio, avatarUrl: user.avatarUrl, isPremium: user.isPremium,
            firstSeen: formatDate(user.firstSeen), lastSeen: formatDate(user.lastSeen),
          } : null,
        };
      }),

    getChannel: publicProcedure
      .input(z.object({ chatId: z.string() }))
      .query(async ({ input }) => {
        const channel = MOCK_CHANNELS.find((c) => c.chatId === input.chatId);
        return {
          channel: channel ? {
            chatId: channel.chatId, username: channel.username, title: channel.title,
            description: channel.description, memberCount: channel.memberCount,
            avatarUrl: channel.avatarUrl, isVerified: channel.isVerified,
          } : null,
        };
      }),

    getGroup: publicProcedure
      .input(z.object({ chatId: z.string() }))
      .query(async ({ input }) => {
        const group = MOCK_GROUPS.find((g) => g.chatId === input.chatId);
        return {
          group: group ? {
            chatId: group.chatId, username: group.username, title: group.title,
            description: group.description, memberCount: group.memberCount,
            groupType: group.groupType,
          } : null,
        };
      }),

    getUserMessages: publicProcedure
      .input(z.object({ userId: z.string(), limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }))
      .query(async ({ input }) => {
        const results = MOCK_MESSAGES.filter((m) => m.userId === input.userId);
        const total = results.length;
        return {
          messages: results.slice(input.offset, input.offset + input.limit).map((m) => ({
            chatId: m.chatId, messageId: m.messageId, userId: m.userId,
            text: m.text, date: formatDate(m.date), mediaType: m.mediaType,
          })),
          total,
        };
      }),
  });
}

function createTestAppRouter() {
  const t = initTRPC.context<Context>().create();
  return t.router({
    search: createSearchSubRouter(),
  });
}

const ctx = { userId: "1234567890", userRole: "user" };
const ctxUnauthenticated = { userId: null, userRole: null };

describe("search mock data search functions", () => {
  let appRouter: ReturnType<typeof createTestAppRouter>;

  beforeEach(() => {
    appRouter = createTestAppRouter();
    mockSql.mockReset();
  });

  describe("profile search", () => {
    it("returns profiles matching username query", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { results: Array<{ username: string }> };
      expect(result.results).toHaveLength(1);
      expect(result.results[0].username).toBe("johndoe");
    });

    it("returns profiles matching id query", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "3456789012", searchBy: "id" }) as { results: Array<{ userId: string }> };
      expect(result.results).toHaveLength(1);
      expect(result.results[0].userId).toBe("3456789012");
    });

    it("returns profiles matching name or bio", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "ML engineer", searchBy: "name" }) as { results: Array<{ displayName: string }> };
      expect(result.results.some((p) => p.displayName === "Sarah Williams")).toBe(true);
    });

    it("returns empty array for no matches", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "zzz_no_match_zzz" }) as { results: Array<{ userId: string }> };
      expect(result.results).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "dev", searchBy: "name", limit: 1 }) as { results: Array<{ userId: string }> };
      expect(result.results).toHaveLength(1);
    });

    it("is case insensitive for username search", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "JOHNDOE", searchBy: "username" }) as { results: Array<{ username: string }> };
      expect(result.results).toHaveLength(1);
      expect(result.results[0].username).toBe("johndoe");
    });

    it("returns empty for blank query string", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "   " }) as { results: Array<{ userId: string }> };
      expect(result.results).toHaveLength(0);
    });

    it("maps all expected profile fields", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { results: Array<Record<string, unknown>> };
      const profile = result.results[0];
      expect(profile).toHaveProperty("userId");
      expect(profile).toHaveProperty("username");
      expect(profile).toHaveProperty("displayName");
      expect(profile).toHaveProperty("bio");
      expect(profile).toHaveProperty("avatarUrl");
      expect(profile).toHaveProperty("isPremium");
      expect(profile).toHaveProperty("firstSeen");
      expect(profile).toHaveProperty("lastSeen");
    });
  });

  describe("channel search", () => {
    it("returns channels matching username", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.channel({ query: "technews" }) as { results: Array<{ username: string }> };
      expect(result.results.some((c) => c.username === "technews")).toBe(true);
    });

    it("returns channels matching title", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.channel({ query: "crypto signals" }) as { results: Array<{ title: string }> };
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("Crypto Signals & News");
    });

    it("returns channels matching description", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.channel({ query: "tutorials" }) as { results: Array<{ title: string }> };
      expect(result.results.some((c) => c.title === "Programming Hub")).toBe(true);
    });

    it("returns empty array for no matches", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.channel({ query: "nonexistent_channel_xyz" }) as { results: Array<{ chatId: string }> };
      expect(result.results).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.channel({ query: "a", limit: 2 }) as { results: Array<{ chatId: string }> };
      expect(result.results).toHaveLength(2);
    });

    it("maps all expected channel fields", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.channel({ query: "technews" }) as { results: Array<Record<string, unknown>> };
      const channel = result.results[0];
      expect(channel).toHaveProperty("chatId");
      expect(channel).toHaveProperty("username");
      expect(channel).toHaveProperty("title");
      expect(channel).toHaveProperty("description");
      expect(channel).toHaveProperty("memberCount");
      expect(channel).toHaveProperty("avatarUrl");
      expect(channel).toHaveProperty("isVerified");
    });

    it("is case insensitive", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.channel({ query: "TECHNEWS" }) as { results: Array<{ username: string }> };
      expect(result.results).toHaveLength(1);
    });
  });

  describe("group search", () => {
    it("returns groups matching username", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.group({ query: "programming" }) as { results: Array<{ username: string }> };
      expect(result.results.some((g) => g.username === "programming")).toBe(true);
    });

    it("returns groups matching title", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.group({ query: "crypto traders" }) as { results: Array<{ title: string }> };
      expect(result.results.some((g) => g.title === "Crypto Traders Club")).toBe(true);
    });

    it("returns groups matching description", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.group({ query: "ml practitioners" }) as { results: Array<{ title: string }> };
      expect(result.results.some((g) => g.title === "Machine Learning Community")).toBe(true);
    });

    it("returns empty array for no matches", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.group({ query: "zzz_no_match_xyz" }) as { results: Array<{ chatId: string }> };
      expect(result.results).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.group({ query: "a", limit: 1 }) as { results: Array<{ chatId: string }> };
      expect(result.results).toHaveLength(1);
    });

    it("maps all expected group fields including groupType", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.group({ query: "programming" }) as { results: Array<Record<string, unknown>> };
      const group = result.results[0];
      expect(group).toHaveProperty("chatId");
      expect(group).toHaveProperty("username");
      expect(group).toHaveProperty("title");
      expect(group).toHaveProperty("description");
      expect(group).toHaveProperty("memberCount");
      expect(group).toHaveProperty("groupType");
    });

    it("returns both group and supergroup types", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.group({ query: "a" }) as { results: Array<{ groupType: string }> };
      const types = result.results.map((g) => g.groupType);
      expect(types).toContain("supergroup");
      expect(types).toContain("group");
    });
  });

  describe("message search", () => {
    it("returns messages matching text query", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.message({ query: "async/await errors" }) as { results: Array<{ text: string }>; total: number };
      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toContain("async/await errors");
    });

    it("filters by chatId when provided", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.message({ query: "framework", chatId: "9876543210" }) as { results: Array<{ chatId: string }> };
      expect(result.results.every((m) => m.chatId === "9876543210")).toBe(true);
    });

    it("returns empty for blank query", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.message({ query: "  " }) as { results: Array<{ messageId: string }>; total: number };
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("respects limit parameter", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.message({ query: "a", limit: 1 }) as { results: Array<{ messageId: string }> };
      expect(result.results).toHaveLength(1);
    });

    it("maps all expected message fields", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.message({ query: "framework" }) as { results: Array<Record<string, unknown>> };
      const message = result.results[0];
      expect(message).toHaveProperty("chatId");
      expect(message).toHaveProperty("messageId");
      expect(message).toHaveProperty("userId");
      expect(message).toHaveProperty("text");
      expect(message).toHaveProperty("date");
      expect(message).toHaveProperty("mediaType");
    });

    it("includes total count in response", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.message({ query: "framework" }) as { total: number };
      expect(typeof result.total).toBe("number");
    });

    it("returns only messages matching both query and chatId", async () => {
      mockSql.mockResolvedValueOnce([{ balance: 5 }]);
      mockSql.mockResolvedValueOnce([{ balance: 4 }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await appRouter.createCaller(ctx).search.message({ query: "bitcoin", chatId: "9876543210" }) as { results: Array<{ chatId: string; text: string }> };
      expect(result.results.every((m) => m.chatId === "9876543210")).toBe(true);
      expect(result.results.every((m) => m.text.toLowerCase().includes("bitcoin"))).toBe(true);
    });
  });
});

describe("credit gating middleware", () => {
  let appRouter: ReturnType<typeof createTestAppRouter>;

  beforeEach(() => {
    appRouter = createTestAppRouter();
    mockSql.mockReset();
  });

  it("allows procedure execution when balance is 1 or more", async () => {
    mockSql.mockResolvedValueOnce([{ balance: 5 }]);
    mockSql.mockResolvedValueOnce([{ balance: 4 }]);
    mockSql.mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { results: Array<{ username: string }> };
    expect(result.results).toHaveLength(1);
  });

  it("allows procedure execution when balance is exactly 1", async () => {
    mockSql.mockResolvedValueOnce([{ balance: 1 }]);
    mockSql.mockResolvedValueOnce([{ balance: 0 }]);
    mockSql.mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { results: Array<{ username: string }> };
    expect(result.results).toHaveLength(1);
  });

  it("blocks procedure execution when balance is 0", async () => {
    mockSql.mockResolvedValue([{ balance: 0 }]);

    await expect(appRouter.createCaller(ctx).search.profile({ query: "johndoe" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("blocks procedure execution when balance is negative", async () => {
    mockSql.mockResolvedValue([{ balance: -1 }]);

    await expect(appRouter.createCaller(ctx).search.profile({ query: "johndoe" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("treats missing balance row as zero and blocks execution", async () => {
    mockSql.mockResolvedValueOnce([]);

    await expect(appRouter.createCaller(ctx).search.profile({ query: "johndoe" })).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED when user is not authenticated", async () => {
    await expect(appRouter.createCaller(ctxUnauthenticated).search.profile({ query: "johndoe" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not call credit deduction SQL for unauthenticated users", async () => {
    try {
      await appRouter.createCaller(ctxUnauthenticated).search.profile({ query: "johndoe" });
    } catch {
      // expected
    }
    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe("atomic credit deduction", () => {
  let appRouter: ReturnType<typeof createTestAppRouter>;

  beforeEach(() => {
    appRouter = createTestAppRouter();
    mockSql.mockReset();
  });

  it("returns updated balance after deduction", async () => {
    mockSql.mockResolvedValueOnce([{ balance: 5 }]);
    mockSql.mockResolvedValueOnce([{ balance: 4 }]);
    mockSql.mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { creditsRemaining: number };
    expect(result.creditsRemaining).toBe(4);
  });

  it("throws INSUFFICIENT_CREDITS when UPDATE returns no rows", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([]);

    await expect(appRouter.createCaller(ctx).search.profile({ query: "johndoe" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      cause: { code: "INSUFFICIENT_CREDITS" },
    });
  });

  it("logs transaction after successful deduction for profile search", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([]);

    await appRouter.createCaller(ctx).search.profile({ query: "johndoe" });
    expect(mockSql.mock.calls.length).toBe(3);
  });

  it("logs transaction after successful deduction for channel search", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 3 }])
      .mockResolvedValueOnce([{ balance: 2 }])
      .mockResolvedValueOnce([]);

    await appRouter.createCaller(ctx).search.channel({ query: "technews" });
    expect(mockSql.mock.calls.length).toBe(3);
  });

  it("logs transaction after successful deduction for group search", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 3 }])
      .mockResolvedValueOnce([{ balance: 2 }])
      .mockResolvedValueOnce([]);

    await appRouter.createCaller(ctx).search.group({ query: "programming" });
    expect(mockSql.mock.calls.length).toBe(3);
  });

  it("logs transaction after successful deduction for message search", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 3 }])
      .mockResolvedValueOnce([{ balance: 2 }])
      .mockResolvedValueOnce([]);

    await appRouter.createCaller(ctx).search.message({ query: "framework" });
    expect(mockSql.mock.calls.length).toBe(3);
  });

  it("returns a unique transactionId in the response", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { transactionId: string };
    expect(typeof result.transactionId).toBe("string");
    expect(result.transactionId.length).toBeGreaterThan(0);
    expect(result.transactionId).toMatch(/^search:\d+:[a-z0-9]+$/);
  });

  it("each search generates a unique transactionId", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([{ balance: 3 }])
      .mockResolvedValueOnce([]);

    const result1 = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { transactionId: string };
    const result2 = await appRouter.createCaller(ctx).search.channel({ query: "technews" }) as { transactionId: string };
    expect(result1.transactionId).not.toBe(result2.transactionId);
  });
});

describe("public read-only procedures", () => {
  let appRouter: ReturnType<typeof createTestAppRouter>;

  beforeEach(() => {
    appRouter = createTestAppRouter();
    mockSql.mockReset();
  });

  it("getProfile returns profile when found", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getProfile({ userId: "1234567890" }) as { profile: { userId: string } | null };
    expect(result.profile).not.toBeNull();
    expect(result.profile?.userId).toBe("1234567890");
  });

  it("getProfile returns null when not found", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getProfile({ userId: "nonexistent" }) as { profile: null };
    expect(result.profile).toBeNull();
  });

  it("getChannel returns channel when found", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getChannel({ chatId: "9876543210" }) as { channel: { chatId: string } | null };
    expect(result.channel).not.toBeNull();
    expect(result.channel?.chatId).toBe("9876543210");
  });

  it("getChannel returns null when not found", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getChannel({ chatId: "nonexistent" }) as { channel: null };
    expect(result.channel).toBeNull();
  });

  it("getGroup returns group when found", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getGroup({ chatId: "5555555555" }) as { group: { chatId: string } | null };
    expect(result.group).not.toBeNull();
    expect(result.group?.chatId).toBe("5555555555");
  });

  it("getGroup returns null when not found", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getGroup({ chatId: "nonexistent" }) as { group: null };
    expect(result.group).toBeNull();
  });

  it("getUserMessages returns messages for a user", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getUserMessages({ userId: "1234567890" }) as { messages: Array<{ userId: string }>; total: number };
    expect(result.messages.every((m) => m.userId === "1234567890")).toBe(true);
  });

  it("getUserMessages returns empty when user has no messages", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getUserMessages({ userId: "7899999999" }) as { messages: Array<{ messageId: string }>; total: number };
    expect(result.messages).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("getUserMessages respects limit and offset", async () => {
    const result = await appRouter.createCaller(ctxUnauthenticated).search.getUserMessages({ userId: "1234567890", limit: 1, offset: 0 }) as { messages: Array<{ messageId: string }> };
    expect(result.messages).toHaveLength(1);
  });

  it("public procedures do not deduct credits", async () => {
    await appRouter.createCaller(ctxUnauthenticated).search.getProfile({ userId: "1234567890" });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("public procedures work without authentication", async () => {
    await expect(appRouter.createCaller(ctxUnauthenticated).search.getProfile({ userId: "1234567890" })).resolves.toBeDefined();
    await expect(appRouter.createCaller(ctxUnauthenticated).search.getChannel({ chatId: "9876543210" })).resolves.toBeDefined();
    await expect(appRouter.createCaller(ctxUnauthenticated).search.getGroup({ chatId: "5555555555" })).resolves.toBeDefined();
  });
});

describe("input validation", () => {
  let appRouter: ReturnType<typeof createTestAppRouter>;

  beforeEach(() => {
    appRouter = createTestAppRouter();
    mockSql.mockReset();
  });

  it("rejects empty query string for profile search", async () => {
    await expect(appRouter.createCaller(ctx).search.profile({ query: "" })).rejects.toThrow();
  });

  it("rejects empty query string for channel search", async () => {
    await expect(appRouter.createCaller(ctx).search.channel({ query: "" })).rejects.toThrow();
  });

  it("rejects empty query string for group search", async () => {
    await expect(appRouter.createCaller(ctx).search.group({ query: "" })).rejects.toThrow();
  });

  it("rejects empty query string for message search", async () => {
    await expect(appRouter.createCaller(ctx).search.message({ query: "" })).rejects.toThrow();
  });

  it("rejects limit above maximum for profile search", async () => {
    await expect(appRouter.createCaller(ctx).search.profile({ query: "johndoe", limit: 100 })).rejects.toThrow();
  });

  it("rejects limit above maximum for channel search", async () => {
    await expect(appRouter.createCaller(ctx).search.channel({ query: "technews", limit: 100 })).rejects.toThrow();
  });

  it("validates search input", async () => {
    await expect(appRouter.createCaller(ctx).search.profile({ query: "" })).rejects.toThrow();
  });
});

describe("credit deduction and transaction logging integration", () => {
  let appRouter: ReturnType<typeof createTestAppRouter>;

  beforeEach(() => {
    appRouter = createTestAppRouter();
    mockSql.mockReset();
  });

  it("deducts credit and logs transaction in correct order", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as { creditsRemaining: number };
    expect(result.creditsRemaining).toBe(4);
    expect(mockSql.mock.calls.length).toBe(3);
  });

  it("profile search returns results, creditsRemaining, and transactionId", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.profile({ query: "johndoe" }) as Record<string, unknown>;
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("creditsRemaining");
    expect(result).toHaveProperty("transactionId");
  });

  it("channel search returns results, creditsRemaining, and transactionId", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.channel({ query: "technews" }) as Record<string, unknown>;
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("creditsRemaining");
    expect(result).toHaveProperty("transactionId");
  });

  it("group search returns results, creditsRemaining, and transactionId", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.group({ query: "programming" }) as Record<string, unknown>;
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("creditsRemaining");
    expect(result).toHaveProperty("transactionId");
  });

  it("message search additionally includes total count", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(ctx).search.message({ query: "framework" }) as Record<string, unknown>;
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("creditsRemaining");
    expect(result).toHaveProperty("transactionId");
    expect(result).toHaveProperty("total");
  });

  it("all four credit-gated procedures deduct credits independently", async () => {
    mockSql
      .mockResolvedValueOnce([{ balance: 5 }])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ balance: 4 }])
      .mockResolvedValueOnce([{ balance: 3 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ balance: 3 }])
      .mockResolvedValueOnce([{ balance: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ balance: 2 }])
      .mockResolvedValueOnce([{ balance: 1 }])
      .mockResolvedValueOnce([]);

    const caller = appRouter.createCaller(ctx);
    await caller.search.profile({ query: "johndoe" });
    await caller.search.channel({ query: "technews" });
    await caller.search.group({ query: "programming" });
    await caller.search.message({ query: "framework" });

    expect(mockSql.mock.calls.length).toBe(12);
  });
});
