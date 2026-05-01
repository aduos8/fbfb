import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";
import { lookupRouter } from "./lookup";
import type { Context } from "../context";
import type { LookupMessage } from "../../../shared/api";

const {
  canUseMessageSearchMock,
  getLookupMessageMock,
  getViewerAccessMock,
  listMessagesByUserBucketMock,
  loadSingleRedactionMock,
} = vi.hoisted(() => ({
  canUseMessageSearchMock: vi.fn(),
  getLookupMessageMock: vi.fn(),
  getViewerAccessMock: vi.fn(),
  listMessagesByUserBucketMock: vi.fn(),
  loadSingleRedactionMock: vi.fn(),
}));

vi.mock("../../lib/tg-queries/queries", () => ({
  getChatById: vi.fn(),
  getParticipationByUser: vi.fn(),
  getUserById: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserHistory: vi.fn(),
  getUserHistoryForBatch: vi.fn(),
  listChatsByIds: vi.fn(),
  listMessagesByChatBucket: vi.fn(),
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
  loadRedactionMap: vi.fn(),
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
    bucket: "202605",
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
    contextLink: `/lookup/message/chat-${index}/message-${index}?bucket=202605`,
    redaction: { applied: false, type: "none", redactedFields: [], reason: null },
  };
}

describe("lookup.getUserMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getViewerAccessMock.mockResolvedValue({ userId: "viewer-1", role: "user", canBypassRedactions: false });
    canUseMessageSearchMock.mockResolvedValue(true);
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
    expect(getLookupMessageMock).toHaveBeenCalledTimes(10);
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
});
