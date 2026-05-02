import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { applyResolvedRedaction, normalizeRedactedFields, type ResolvedRedaction } from "./redactions";

const regularViewer = {
  userId: "viewer-1",
  role: "user" as const,
  hasActiveSubscription: false,
  canBypassRedactions: false,
};

const privilegedViewer = {
  userId: "viewer-2",
  role: "admin" as const,
  hasActiveSubscription: true,
  canBypassRedactions: true,
};

const fullRedaction: ResolvedRedaction = {
  id: "full-1",
  targetType: "user",
  targetId: "user-1",
  type: "full",
  fields: ["userId", "username", "displayName", "bio", "profilePhoto", "phone", "messages", "groups", "channels"],
  reason: "legal",
};

describe("redaction integration", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("full redaction", () => {
    it("should completely hide profile data", () => {
      const result = applyResolvedRedaction({
        telegramUserId: "123456789",
        username: "testuser",
        displayName: "Test User",
        bio: "User bio",
        profilePhoto: "https://example.com/photo.jpg",
      }, fullRedaction, regularViewer);

      expect(result).toBeNull();
    });

    it("should enforce full redaction for admin by default", () => {
      const result = applyResolvedRedaction({
        telegramUserId: "123456789",
        username: "testuser",
      }, fullRedaction, privilegedViewer);

      expect(result).toBeNull();
    });

    it("should allow admin to bypass full redaction only when explicitly enabled", () => {
      vi.stubEnv("ALLOW_REDACTION_BYPASS", "true");
      const result = applyResolvedRedaction({
        telegramUserId: "123456789",
        username: "testuser",
      }, fullRedaction, privilegedViewer);

      expect(result?.telegramUserId).toBe("123456789");
      expect(result?.username).toBe("testuser");
    });
  });

  describe("partial redaction field selection", () => {
    it("should only redact selected fields in partial redaction", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-1",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["username"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        telegramUserId: "123456789",
        username: "testuser",
        displayName: "Test User",
        bio: "User bio",
      }, partialRedaction, regularViewer);

      expect(result?.telegramUserId).toBe("123456789");
      expect(result?.username).toBe("[redacted]");
      expect(result?.displayName).toBe("Test User");
      expect(result?.bio).toBe("User bio");
    });

    it("should redact multiple selected fields", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-2",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["username", "bio"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        telegramUserId: "123456789",
        username: "testuser",
        displayName: "Test User",
        bio: "User bio",
      }, partialRedaction, regularViewer);

      expect(result?.username).toBe("[redacted]");
      expect(result?.bio).toBe("[redacted]");
      expect(result?.displayName).toBe("Test User");
    });

    it("should redact userId when selected", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-3",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["userId", "username"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        telegramUserId: "123456789",
        username: "testuser",
        displayName: "Test User",
      }, partialRedaction, regularViewer);

      expect(result?.telegramUserId).toBeNull();
      expect(result?.username).toBe("[redacted]");
      expect(result?.displayName).toBe("Test User");
    });
  });

  describe("field aliases", () => {
    it("should normalize various field name formats", () => {
      expect(normalizeRedactedFields(["telegramUserId"])).toContain("userId");
      expect(normalizeRedactedFields(["user_id"])).toContain("userId");
      expect(normalizeRedactedFields(["display_name"])).toContain("displayName");
      expect(normalizeRedactedFields(["avatar_url"])).toContain("profilePhoto");
      expect(normalizeRedactedFields(["phone_number"])).toContain("phone");
      expect(normalizeRedactedFields(["active_chats"])).toContain("groups");
    });
  });

  describe("metadata redaction", () => {
    it("should redact profilePhoto and related fields", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-4",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["profilePhoto"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        profilePhoto: "https://example.com/photo.jpg",
        avatar_url: "https://example.com/avatar.jpg",
        avatarUrl: "https://example.com/avatar2.jpg",
      }, partialRedaction, regularViewer);

      expect(result?.profilePhoto).toBeNull();
      expect(result?.avatar_url).toBeNull();
      expect(result?.avatarUrl).toBeNull();
    });

    it("should redact displayName and related fields", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-5",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["displayName"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        displayName: "Test User",
        channelTitle: "Channel Name",
        groupTitle: "Group Name",
        title: "Some Title",
      }, partialRedaction, regularViewer);

      expect(result?.displayName).toBe("[redacted]");
      expect(result?.channelTitle).toBe("[redacted]");
      expect(result?.groupTitle).toBe("[redacted]");
      expect(result?.title).toBe("[redacted]");
    });

    it("should redact messages and related fields", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-6",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["messages"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        content: "Hello world",
        snippet: "Hello...",
        highlightedSnippet: "<mark>Hello</mark>...",
        matchedTerms: ["Hello"],
      }, partialRedaction, regularViewer);

      expect(result?.content).toBe("[redacted]");
      expect(result?.snippet).toBe("[redacted]");
      expect(result?.highlightedSnippet).toBe("[redacted]");
      expect(result?.matchedTerms).toEqual([]);
    });

    it("should redact groups and channels arrays", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-7",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["groups", "channels"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        groups: [{ id: 1 }, { id: 2 }],
        channels: [{ id: 3 }],
        activeChats: [{ id: 4 }],
      }, partialRedaction, regularViewer);

      expect(result?.groups).toEqual([]);
      expect(result?.channels).toEqual([]);
      expect(result?.activeChats).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("should handle null redaction gracefully", () => {
      const result = applyResolvedRedaction({
        username: "visible",
        displayName: "Visible User",
      }, null, regularViewer);

      expect(result?.username).toBe("visible");
      expect(result?.displayName).toBe("Visible User");
    });

    it("should handle undefined redaction gracefully", () => {
      const result = applyResolvedRedaction({
        username: "visible",
        displayName: "Visible User",
      }, undefined, regularViewer);

      expect(result?.username).toBe("visible");
      expect(result?.displayName).toBe("Visible User");
    });

    it("should preserve non-redacted fields in partial redaction", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-edge",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["username"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({
        id: 12345,
        username: "testuser",
        createdAt: "2024-01-01",
        isActive: true,
        score: 95.5,
      }, partialRedaction, regularViewer);

      expect(result?.id).toBe(12345);
      expect(result?.username).toBe("[redacted]");
      expect(result?.createdAt).toBe("2024-01-01");
      expect(result?.isActive).toBe(true);
      expect(result?.score).toBe(95.5);
    });

    it("should handle empty record with redaction", () => {
      const partialRedaction: ResolvedRedaction = {
        id: "partial-empty",
        targetType: "user",
        targetId: "user-1",
        type: "partial",
        fields: ["username"],
        reason: "privacy",
      };

      const result = applyResolvedRedaction({}, partialRedaction, regularViewer);

      expect(result).not.toBeNull();
      expect(result?.redaction).toBeDefined();
      expect(result?.redaction.applied).toBe(true);
    });
  });

  describe("viewer bypass", () => {
    it("should enforce redaction for subscription viewer by default", () => {
      const subscriptionViewer = {
        userId: "viewer-3",
        role: "user" as const,
        hasActiveSubscription: true,
        canBypassRedactions: true,
      };

      const result = applyResolvedRedaction({
        username: "testuser",
        displayName: "Test User",
      }, fullRedaction, subscriptionViewer);

      expect(result).toBeNull();
    });

    it("should add redaction metadata for bypassed redactions", () => {
      vi.stubEnv("ALLOW_REDACTION_BYPASS", "true");
      const result = applyResolvedRedaction({
        username: "testuser",
      }, fullRedaction, privilegedViewer);

      expect(result?.redaction).toBeDefined();
      expect(result?.redaction.applied).toBe(true);
      expect(result?.redaction.type).toBe("full");
    });
  });
});
