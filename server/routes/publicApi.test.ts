import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePublicApiSearch } from "./publicApi";

const {
  authenticateApiKeyMock,
  deductSearchCreditMock,
  ensureSearchCreditsMock,
  getViewerAccessMock,
  resolveUserApiAccessMock,
  runUnifiedSearchMock,
} = vi.hoisted(() => ({
  authenticateApiKeyMock: vi.fn(),
  deductSearchCreditMock: vi.fn(),
  ensureSearchCreditsMock: vi.fn(),
  getViewerAccessMock: vi.fn(),
  resolveUserApiAccessMock: vi.fn(),
  runUnifiedSearchMock: vi.fn(),
}));

vi.mock("../lib/db/apiAccess", () => ({
  resolveUserApiAccess: resolveUserApiAccessMock,
}));

vi.mock("../lib/db/apiKeys", () => ({
  authenticateApiKey: authenticateApiKeyMock,
}));

vi.mock("../lib/tg-queries/viewer", () => ({
  deductSearchCredit: deductSearchCreditMock,
  ensureSearchCredits: ensureSearchCreditsMock,
  getViewerAccess: getViewerAccessMock,
}));

vi.mock("../lib/tg-queries/searchService", () => ({
  runUnifiedSearch: runUnifiedSearchMock,
}));

function createRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    body,
    ip: "203.0.113.10",
    header(name: string) {
      return normalizedHeaders.get(name.toLowerCase());
    },
  } as any;
}

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      res.body = value;
      return res;
    }),
    setHeader: vi.fn(),
  };
  return res as any;
}

describe("public API search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateApiKeyMock.mockResolvedValue({
      id: "key-1",
      user_id: "user-1",
      name: "Website key",
      role: "user",
    });
    resolveUserApiAccessMock.mockResolvedValue({ allowed: true, reason: "advanced plan allows API access" });
    getViewerAccessMock.mockResolvedValue({ userId: "user-1", role: "user", canBypassRedactions: false });
    deductSearchCreditMock.mockResolvedValue(24);
    ensureSearchCreditsMock.mockResolvedValue(24);
    runUnifiedSearchMock.mockResolvedValue({
      type: "profile",
      results: [],
      total: 0,
      page: 1,
      limit: 25,
    });
  });

  it("accepts google_docs q alias and profile filter aliases", async () => {
    const req = createRequest({
      type: "profile",
      q: "alice",
      filters: {
        display_name: "Alice",
        number: "+1 555 000 0000",
        user_id: "12345",
      },
    }, { "x-api-key": "fbfb_live_test" });
    const res = createResponse();

    await handlePublicApiSearch(req, res);

    expect(res.statusCode).toBe(200);
    expect(deductSearchCreditMock).toHaveBeenCalledWith("user-1", "api:profile", "alice");
    expect(runUnifiedSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "profile",
      query: "alice",
      filters: {
        username: undefined,
        displayName: "Alice",
        phone: "+1 555 000 0000",
        bio: undefined,
        userId: "12345",
      },
    }), expect.any(Object));
  });

  it("denies plan access before deducting credits or searching", async () => {
    resolveUserApiAccessMock.mockResolvedValue({ allowed: false, reason: "Your plan does not include API access" });
    const req = createRequest({ type: "profile", q: "alice" }, { authorization: "Bearer fbfb_live_test" });
    const res = createResponse();

    await handlePublicApiSearch(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Your plan does not include API access",
      code: "api_access_denied",
    });
    expect(deductSearchCreditMock).not.toHaveBeenCalled();
    expect(runUnifiedSearchMock).not.toHaveBeenCalled();
  });

  it("rate limits repeated API key requests before search execution", async () => {
    const first = createResponse();
    await handlePublicApiSearch(createRequest({ type: "profile", q: "first" }, { "x-api-key": "fbfb_live_rate_limit" }), first);

    for (let index = 0; index < 30; index += 1) {
      const res = createResponse();
      await handlePublicApiSearch(createRequest({ type: "profile", q: `q-${index}` }, { "x-api-key": "fbfb_live_rate_limit" }), res);
      if (res.statusCode === 429) {
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          code: "rate_limited",
        }));
        expect(runUnifiedSearchMock).toHaveBeenCalledTimes(index + 1);
        return;
      }
    }

    throw new Error("Expected public API rate limiting to return 429");
  });
});
