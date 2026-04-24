import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  getChatById: vi.fn(),
  getChatWordStats: vi.fn(),
  getParticipationByUser: vi.fn(),
  getParticipationMetaByUser: vi.fn(),
  getUserWordStats: vi.fn(),
  listChatsByIds: vi.fn(),
}));

const viewerMocks = vi.hoisted(() => ({
  canViewMessageAnalytics: vi.fn(),
  getViewerAccess: vi.fn(),
}));

const redactionMocks = vi.hoisted(() => ({
  loadSingleRedaction: vi.fn(),
}));

vi.mock("../../lib/tg-queries/queries", () => ({
  getChatById: queryMocks.getChatById,
  getChatWordStats: queryMocks.getChatWordStats,
  getParticipationByUser: queryMocks.getParticipationByUser,
  getParticipationMetaByUser: queryMocks.getParticipationMetaByUser,
  getUserWordStats: queryMocks.getUserWordStats,
  listChatsByIds: queryMocks.listChatsByIds,
}));

vi.mock("../../lib/tg-queries/viewer", () => ({
  canViewMessageAnalytics: viewerMocks.canViewMessageAnalytics,
  getViewerAccess: viewerMocks.getViewerAccess,
}));

vi.mock("../../lib/tg-queries/redactions", () => ({
  loadSingleRedaction: redactionMocks.loadSingleRedaction,
}));

import { analyticsRouter } from "./analytics";

function cassandraCounter(value: number) {
  return {
    toNumber: () => value,
    toString: () => String(value),
  };
}

describe("analyticsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewerMocks.getViewerAccess.mockResolvedValue({
      userId: "viewer-1",
      role: "user",
      hasActiveSubscription: true,
      canBypassRedactions: false,
    });
    viewerMocks.canViewMessageAnalytics.mockResolvedValue(true);
    redactionMocks.loadSingleRedaction.mockResolvedValue(null);
  });

  it("normalizes Cassandra counter values before returning user analytics", async () => {
    queryMocks.getParticipationByUser.mockResolvedValue([
      { chat_id: "chat-1", message_count: cassandraCounter(12) },
    ]);
    queryMocks.getParticipationMetaByUser.mockResolvedValue([
      {
        chat_id: "chat-1",
        first_message_at: new Date("2026-04-01T00:00:00.000Z"),
        last_message_at: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);
    queryMocks.getUserWordStats.mockResolvedValue([
      { word: "alpha", count: cassandraCounter(7) },
      { word: "the", count: cassandraCounter(50) },
    ]);
    queryMocks.listChatsByIds.mockResolvedValue([
      {
        chat_id: "chat-1",
        display_name: "General",
        username: "general",
        chat_type: "group",
      },
    ]);

    const caller = analyticsRouter.createCaller({ userId: "viewer-1", userRole: "user" });
    const result = await caller.getUserAnalytics({ userId: "target-1" });

    expect(result.activeChats).toEqual([
      {
        chatId: "chat-1",
        chatName: "General",
        username: "general",
        chatType: "group",
        firstMessageAt: "2026-04-01T00:00:00.000Z",
        lastMessageAt: "2026-04-22T00:00:00.000Z",
        messageCount: 12,
      },
    ]);
    expect(result.frequentWords).toEqual([
      { word: "alpha", count: 7 },
    ]);
    expect(result.groups).toEqual(result.activeChats);
    expect(result.channels).toEqual([]);
  });
});
