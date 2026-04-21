import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { applyResolvedRedaction, buildRedactionMetadata, normalizeRedactedFields, type ResolvedRedaction } from "./redactions";

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

const partialRedaction: ResolvedRedaction = {
  id: "redaction-1",
  targetType: "user",
  targetId: "target-1",
  type: "partial",
  fields: ["username", "displayName", "messages"],
  reason: "privacy",
};

const fullRedaction: ResolvedRedaction = {
  id: "redaction-2",
  targetType: "user",
  targetId: "target-2",
  type: "full",
  fields: ["username", "displayName", "bio", "profilePhoto", "phone", "messages", "groups", "channels"],
  reason: "legal",
};

describe("redactions", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty metadata when no redaction exists", () => {
    expect(buildRedactionMetadata(null)).toEqual({
      applied: false,
      type: "none",
      redactedFields: [],
      reason: null,
    });
  });

  it("applies partial masking to usernames and message content", () => {
    const result = applyResolvedRedaction({
      username: "target",
      displayName: "Target User",
      snippet: "hello world",
      highlightedSnippet: "<mark>hello</mark> world",
      matchedTerms: ["hello"],
    }, partialRedaction, regularViewer);

    expect(result).toMatchObject({
      username: "[redacted]",
      displayName: "[redacted]",
      snippet: "[redacted]",
      highlightedSnippet: "[redacted]",
      matchedTerms: [],
      redaction: {
        applied: true,
        type: "partial",
        reason: "privacy",
      },
    });
  });

  it("hides fully redacted records from regular viewers", () => {
    expect(applyResolvedRedaction({ username: "hidden" }, fullRedaction, regularViewer)).toBeNull();
  });

  it("lets privileged viewers bypass redactions", () => {
    const result = applyResolvedRedaction({ username: "visible" }, fullRedaction, privilegedViewer);
    expect(result).toMatchObject({
      username: "visible",
      redaction: {
        applied: true,
        type: "full",
      },
    });
  });

  it("redacts group title when displayName is in fields", () => {
    const result = applyResolvedRedaction({
      groupTitle: "Secret Group",
      title: "Also Secret",
    }, { ...partialRedaction, fields: ["displayName"] }, regularViewer);

    expect(result?.groupTitle).toBe("[redacted]");
    expect(result?.title).toBe("[redacted]");
  });

  it("redacts channel title when displayName is in fields", () => {
    const result = applyResolvedRedaction({
      channelTitle: "Secret Channel",
    }, { ...partialRedaction, fields: ["displayName"] }, regularViewer);

    expect(result?.channelTitle).toBe("[redacted]");
  });

  it("redacts activeChats when groups is in fields", () => {
    const result = applyResolvedRedaction({
      activeChats: [{ id: 1 }, { id: 2 }],
    }, { ...partialRedaction, fields: ["groups"] }, regularViewer);

    expect(result?.activeChats).toEqual([]);
  });

  it("redacts profilePhoto when profilePhoto is in fields", () => {
    const result = applyResolvedRedaction({
      profilePhoto: "https://example.com/photo.jpg",
      avatar_url: "https://example.com/avatar.jpg",
    }, { ...partialRedaction, fields: ["profilePhoto"] }, regularViewer);

    expect(result?.profilePhoto).toBeNull();
    expect(result?.avatar_url).toBeNull();
  });

  it("partial redaction should hide telegramUserId when userId field is selected", () => {
    const redaction: ResolvedRedaction = {
      ...partialRedaction,
      fields: ["userId", "username"],
    };
    const result = applyResolvedRedaction({
      telegramUserId: "123456789",
      username: "testuser",
    }, redaction, regularViewer);

    expect(result?.telegramUserId).toBeNull();
    expect(result?.username).toBe("[redacted]");
  });

  it("full redaction returns null (caller creates masked result)", () => {
    const fullRedactionUser: ResolvedRedaction = {
      id: "test-full",
      targetType: "user",
      targetId: "test-user",
      type: "full",
      fields: ["userId", "username", "displayName", "bio", "profilePhoto", "phone", "messages", "groups", "channels"],
      reason: "legal",
    };

    const result = applyResolvedRedaction({
      telegramUserId: "123",
      username: "test",
      basicMetadata: {
        firstSeen: "2024-01-01",
        lastSeen: "2024-06-01",
        isTelegramPremium: true,
        trackingStatus: "active",
      },
    }, fullRedactionUser, regularViewer);

    expect(result).toBeNull();
  });

  it("partial redaction does not affect fields not in redaction list", () => {
    const redaction: ResolvedRedaction = {
      ...partialRedaction,
      fields: ["username"],
    };

    const result = applyResolvedRedaction({
      telegramUserId: "123456789",
      username: "testuser",
      bio: "User bio",
      displayName: "Test User",
    }, redaction, regularViewer);

    expect(result?.telegramUserId).toBe("123456789");
    expect(result?.username).toBe("[redacted]");
    expect(result?.bio).toBe("User bio");
    expect(result?.displayName).toBe("Test User");
  });

  it("handles ProfileResult-like partial redaction with username and displayName", () => {
    const redaction: ResolvedRedaction = {
      id: "profile-redaction",
      targetType: "user",
      targetId: "profile-1",
      type: "partial",
      fields: ["username", "displayName"],
      reason: "privacy",
    };

    const profileRecord = {
      resultType: "profile",
      username: "testuser",
      displayName: "Test User",
      profilePhoto: "https://example.com/photo.jpg",
      telegramUserId: "123456",
      basicMetadata: {
        firstSeen: "2024-01-01",
        lastSeen: "2024-06-01",
        isTelegramPremium: null,
        trackingStatus: null,
      },
      bio: "User bio",
      phoneMasked: "+1****789",
      relevance: {
        score: 85,
        confidence: "high" as const,
        reasons: ["username exact match"],
      },
      redaction: buildRedactionMetadata(redaction),
    };

    const result = applyResolvedRedaction(profileRecord, redaction, regularViewer);

    expect(result).not.toBeNull();
    expect(result?.username).toBe("[redacted]");
    expect(result?.displayName).toBe("[redacted]");
    expect(result?.profilePhoto).toBe("https://example.com/photo.jpg");
    expect(result?.telegramUserId).toBe("123456");
    expect(result?.bio).toBe("User bio");
    expect(result?.redaction.applied).toBe(true);
    expect(result?.redaction.type).toBe("partial");
  });

  it("handles ProfileResult-like partial redaction with bio field", () => {
    const redaction: ResolvedRedaction = {
      id: "bio-redaction",
      targetType: "user",
      targetId: "profile-2",
      type: "partial",
      fields: ["bio"],
      reason: "sensitive info",
    };

    const profileRecord = {
      resultType: "profile",
      username: "testuser",
      displayName: "Test User",
      profilePhoto: null,
      telegramUserId: "123456",
      basicMetadata: {
        firstSeen: null,
        lastSeen: null,
        isTelegramPremium: null,
        trackingStatus: null,
      },
      bio: "This is my private bio",
      phoneMasked: null,
      relevance: {
        score: 50,
        confidence: "medium" as const,
        reasons: ["fuzzy profile search"],
      },
      redaction: buildRedactionMetadata(redaction),
    };

    const result = applyResolvedRedaction(profileRecord, redaction, regularViewer);

    expect(result).not.toBeNull();
    expect(result?.username).toBe("testuser");
    expect(result?.displayName).toBe("Test User");
    expect(result?.bio).toBe("[redacted]");
    expect(result?.redaction.applied).toBe(true);
    expect(result?.redaction.redactedFields).toContain("bio");
  });
});

describe("normalizeRedactedFields", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles standard field names", () => {
    const result = normalizeRedactedFields(["username", "displayName", "bio"]);
    expect(result).toContain("username");
    expect(result).toContain("displayName");
    expect(result).toContain("bio");
  });

  it("normalizes snake_case field names", () => {
    const result = normalizeRedactedFields(["display_name", "phone_number", "avatar_url"]);
    expect(result).toContain("displayName");
    expect(result).toContain("phone");
    expect(result).toContain("profilePhoto");
  });

  it("normalizes camelCase field names", () => {
    const result = normalizeRedactedFields(["displayName", "phoneHash", "avatarUrl"]);
    expect(result).toContain("displayName");
    expect(result).toContain("phone");
    expect(result).toContain("profilePhoto");
  });

  it("normalizes mixed variations", () => {
    const result = normalizeRedactedFields(["active_chats", "content", "subscribed_channels"]);
    expect(result).toContain("groups");
    expect(result).toContain("messages");
    expect(result).toContain("channels");
  });

  it("handles JSON string input", () => {
    const result = normalizeRedactedFields('["display_name", "username"]');
    expect(result).toContain("displayName");
    expect(result).toContain("username");
  });

  it("deduplicates normalized fields", () => {
    const result = normalizeRedactedFields(["display_name", "displayName", "name"]);
    expect(result.filter(f => f === "displayName")).toHaveLength(1);
  });

  it("logs warning for unknown fields", () => {
    const warnSpy = vi.spyOn(console, "warn");
    const result = normalizeRedactedFields(["unknown_field", "another_one"]);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("handles empty input", () => {
    const result = normalizeRedactedFields([]);
    expect(result).toEqual([]);
  });

  it("handles null input", () => {
    const result = normalizeRedactedFields(null);
    expect(result).toEqual([]);
  });

  it("handles undefined input", () => {
    const result = normalizeRedactedFields(undefined);
    expect(result).toEqual([]);
  });
});
