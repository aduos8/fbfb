import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";
import { lookupRouter } from "./lookup";
import type { Context } from "../context";
import type { LookupMessage } from "../../../shared/api";

const {
  canUseMessageSearchMock,
  getChatByIdMock,
  getLookupMessageMock,
  getParticipationMetaByUserMock,
  getViewerAccessMock,
  listMessagesByChatBucketForUserMock,
  listMessagesByIdForUserMock,
  listMessagesByUserBucketMock,
  loadRedactionMapMock,
  loadSingleRedactionMock,
} = vi.hoisted(() => ({
  canUseMessageSearchMock: vi.fn(),
  getChatByIdMock: vi.fn(),
  getLookupMessageMock: vi.fn(),
  getParticipationMetaByUserMock: vi.fn(),
  getViewerAccessMock: vi.fn(),
  listMessagesByChatBucketForUserMock: vi.fn(),
  listMessagesByIdForUserMock: vi.fn(),
  listMessagesByUserBucketMock: vi.fn(),
  loadRedactionMapMock: vi.fn(),
  loadSingleRedactionMock: vi.fn(),
}));

vi.mock("../../lib/tg-queries/queries", () => ({
  getChatById: getChatByIdMock,
  getParticipationMetaByUser: getParticipationMetaByUserMock,
  getParticipationByUser: vi.fn(),
  getUserById: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserHistory: vi.fn(),
  getUserHistoryForBatch: vi.fn(),
  formatMessageBucket: vi.fn((value: Date | string | null | undefined) => {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  }),
  listChatsByIds: vi.fn(),
  listMessagesByChatBucketForUser: listMessagesByChatBucketForUserMock,
  listMessagesByChatBucket: vi.fn(),
  listMessagesByIdForUser: listMessagesByIdForUserMock,
  listMessagesByUserBucket: listMessagesByUserBucketMock,
}));

vi.mock("../../lib/tg-queries/viewer", () => ({
  canUseMessageSearch: canUseMessageSearchMock,
  canUseProfileFullAccess: vi.fn(),
  getViewerAccess: getViewerAccessMock,
}));

vi.mock("../../lib/tg-queries/redactions", () => ({
  applyResolvedRedaction: vi.fn((value) => value),
  buildRedactionMetadata: vi.fn(() => ({ applied: false, type: "none", redactedFields: [], reason: null })),
  loadRedactionMap: loadRedactionMapMock,
  loadSingleRedaction: loadSingleRedactionMock,
}));

vi.mock("../../lib/tg-queries/storageAssets", () => ({
  toApiServedAssetUrl: vi.fn((value) => value),
}));

vi.mock("../../lib/db/tracking", () => ({
  getTrackingByProfile: vi.fn(),
}));

vi.mock("../../lib/tg-queries/phone", () => ({
  maskPhoneNumber: vi.fn((value) => value),
}));

vi.mock("../../lib/tg-queries/searchService", () => ({
  getLookupMessage: getLookupMessageMock,
}));

function createCaller(ctx: Partial<Context> = {}) {
  const t = initTRPC.context<Context>().create();
  const appRouter = t.router({ lookup: lookupRouter });
  return appRouter.createCaller({
    userId: "viewer-1",
    userRole: "user",
    ...ctx,
  } as Context);
}

function messageRow(index: number) {
  return {
    bucket: "2026-05",
    chat_id: `chat-${index}`,
    message_id: `message-${index}`,
    user_id: "target-user",
    content: `message ${index}`,
    timestamp: new Date(`2026-05-01T10:${String(index).padStart(2, "0")}:00.000Z`),
    has_media: false,
  };
}

function lookupMessage(index: number): LookupMessage {
  return {
    messageId: `message-${index}`,
    chatId: `chat-${index}`,
    timestamp: `2026-05-01T10:${String(index).padStart(2, "0")}:00.000Z`,
    content: `message ${index}`,
    highlightedSnippet: `message ${index}`,
    hasMedia: false,
    containsLinks: false,
    sender: { userId: "target-user", username: "target", displayName: "Target User" },
    chat: { chatId: `chat-${index}`, title: `Chat ${index}`, type: "group", username: null },
    contextLink: `/lookup/message/chat-${index}/message-${index}?bucket=2026-05`,
    redaction: { applied: false, type: "none", redactedFields: [], reason: null },
  };
}

describe("lookup.getUserMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getViewerAccessMock.mockResolvedValue({ userId: "viewer-1", role: "user", canBypassRedactions: false });
    canUseMessageSearchMock.mockResolvedValue(true);
    getChatByIdMock.mockResolvedValue(null);
    getParticipationMetaByUserMock.mockResolvedValue([]);
    listMessagesByChatBucketForUserMock.mockResolvedValue([]);
    listMessagesByIdForUserMock.mockResolvedValue([]);
    loadRedactionMapMock.mockResolvedValue(new Map());
    loadSingleRedactionMock.mockResolvedValue(null);
    listMessagesByUserBucketMock.mockResolvedValue([]);
    getLookupMessageMock.mockImplementation((_chatId, messageId) => {
      const index = Number(String(messageId).replace("message-", ""));
      return Promise.resolve(lookupMessage(index));
    });
  });

  it("fetches the last 10 messages by user id and exposes a next cursor", async () => {
    listMessagesByUserBucketMock.mockResolvedValueOnce(Array.from({ length: 11 }, (_, index) => messageRow(index)));

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(listMessagesByUserBucketMock).toHaveBeenCalledWith("target-user", expect.any(String), 11);
    expect(getLookupMessageMock).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(10);
    expect(result.items[0]?.sender.userId).toBe("target-user");
    expect(result.nextCursor).toBe("10");
    expect(result.unavailableReason).toBeUndefined();
  });

  it("returns a locked reason when message access is not available", async () => {
    canUseMessageSearchMock.mockResolvedValue(false);

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(result).toEqual({ items: [], nextCursor: null, unavailableReason: "message_access_required" });
    expect(listMessagesByUserBucketMock).not.toHaveBeenCalled();
  });

  it("returns a redacted reason when user messages are redacted", async () => {
    loadSingleRedactionMock.mockResolvedValue({
      id: "redaction-1",
      targetType: "user",
      targetId: "target-user",
      type: "partial",
      fields: ["messages"],
      reason: "privacy request",
      isActive: true,
    });

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(result).toEqual({ items: [], nextCursor: null, unavailableReason: "redacted" });
    expect(listMessagesByUserBucketMock).not.toHaveBeenCalled();
  });

  it("returns a normal empty state when the user has no recent messages", async () => {
    const result = await createCaller().lookup.getUserMessages({ userId: "quiet-user", limit: 10 });

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
    expect(result.unavailableReason).toBeUndefined();
  });

  it("finds the user's historical latest message bucket while scanning the full user message table", async () => {
    getParticipationMetaByUserMock.mockResolvedValue([
      {
        user_id: "target-user",
        chat_id: "chat-older",
        first_message_at: new Date("2024-02-01T00:00:00.000Z"),
        last_message_at: new Date("2024-03-15T00:00:00.000Z"),
      },
    ]);
    listMessagesByUserBucketMock.mockImplementation((_userId, bucket) => (
      bucket === "2024-03"
        ? Promise.resolve(Array.from({ length: 11 }, (_, index) => ({ ...messageRow(index), bucket: "2024-03" })))
        : Promise.resolve([])
    ));

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(listMessagesByUserBucketMock.mock.calls.some((call) => call[1] === "2024-03")).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it("still finds messages from older buckets when participation metadata is empty", async () => {
    getParticipationMetaByUserMock.mockResolvedValue([]);
    listMessagesByUserBucketMock.mockImplementation((_userId, bucket) => (
      bucket === "2014-01"
        ? Promise.resolve([{ ...messageRow(1), bucket: "2014-01" }])
        : Promise.resolve([])
    ));

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(listMessagesByUserBucketMock.mock.calls.some((call) => call[1] === "2014-01")).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.contextLink).toContain("bucket=2014-01");
  });

  it("builds messages directly from messages_by_user rows without exact lookup hydration", async () => {
    const row = {
      ...messageRow(1),
      chat_id: "chat-fallback",
      message_id: "message-fallback",
      content: "direct row content",
      timestamp: new Date("2024-03-15T12:00:00.000Z"),
      bucket: "2024-03",
    };
    getParticipationMetaByUserMock.mockResolvedValue([
      {
        user_id: "target-user",
        chat_id: "chat-fallback",
        first_message_at: new Date("2024-03-01T00:00:00.000Z"),
        last_message_at: new Date("2024-03-15T12:00:00.000Z"),
      },
    ]);
    listMessagesByUserBucketMock.mockResolvedValueOnce([row]);
    getLookupMessageMock.mockResolvedValue(null);
    getChatByIdMock.mockResolvedValue({
      chat_id: "chat-fallback",
      display_name: "Fallback Chat",
      username: "fallback_chat",
      chat_type: "group",
    });

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(getLookupMessageMock).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.content).toBe("direct row content");
    expect(result.items[0]?.chat.title).toBe("Fallback Chat");
    expect(result.items[0]?.contextLink).toContain("bucket=2024-03");
  });

  it("skips empty messages when building the recent user message list", async () => {
    listMessagesByUserBucketMock.mockResolvedValueOnce([
      { ...messageRow(1), message_id: "message-empty", content: "" },
      { ...messageRow(2), message_id: "message-space", content: "   " },
      { ...messageRow(3), message_id: "message-text", content: "actual text" },
    ]);

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(result.items.map((item) => item.messageId)).toEqual(["message-text"]);
  });

  it("checks messages_by_chat and messages_by_id when building the user's last messages", async () => {
    getParticipationMetaByUserMock.mockResolvedValue([
      {
        user_id: "target-user",
        chat_id: "chat-from-meta",
        first_message_at: new Date("2026-05-01T00:00:00.000Z"),
        last_message_at: new Date("2026-05-01T11:00:00.000Z"),
      },
    ]);
    listMessagesByUserBucketMock.mockResolvedValueOnce([
      { ...messageRow(1), chat_id: "chat-from-user", message_id: "message-user", content: "from user table" },
    ]);
    listMessagesByChatBucketForUserMock.mockResolvedValueOnce([
      { ...messageRow(2), chat_id: "chat-from-meta", message_id: "message-chat", content: "from chat table" },
    ]);
    listMessagesByIdForUserMock.mockResolvedValueOnce([
      { ...messageRow(3), chat_id: "chat-from-id", message_id: "message-id", content: "from id table" },
    ]);

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(listMessagesByUserBucketMock).toHaveBeenCalled();
    expect(listMessagesByChatBucketForUserMock).toHaveBeenCalledWith("chat-from-meta", expect.any(String), "target-user", expect.any(Number));
    expect(listMessagesByIdForUserMock).toHaveBeenCalledWith("target-user", expect.any(Number));
    expect(result.items.map((item) => item.messageId)).toEqual([
      "message-id",
      "message-chat",
      "message-user",
    ]);
  });

  it("keeps returning messages when supplemental table checks fail", async () => {
    listMessagesByUserBucketMock.mockResolvedValueOnce([
      { ...messageRow(1), chat_id: "chat-from-user", message_id: "message-user", content: "from user table" },
    ]);
    getParticipationMetaByUserMock.mockResolvedValue([
      {
        user_id: "target-user",
        chat_id: "chat-from-meta",
        first_message_at: new Date("2026-05-01T00:00:00.000Z"),
        last_message_at: new Date("2026-05-01T11:00:00.000Z"),
      },
    ]);
    listMessagesByChatBucketForUserMock.mockRejectedValueOnce(new Error("chat table failed"));
    listMessagesByIdForUserMock.mockRejectedValueOnce(new Error("id table failed"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createCaller().lookup.getUserMessages({ userId: "target-user", limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.messageId).toBe("message-user");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
