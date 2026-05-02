import { describe, expect, it } from "vitest";
import {
  buildExplorerCurlSnippet,
  buildExplorerFetchSnippet,
  createDefaultSearchRequest,
  normalizeExplorerApiKey,
} from "./publicApiDocs";

describe("publicApiDocs helpers", () => {
  it("creates a profile default request that uses the public q alias", () => {
    expect(createDefaultSearchRequest("profile")).toEqual({
      type: "profile",
      q: "alice",
      filters: {
        display_name: "Alice",
        number: "+15550000000",
      },
      page: 1,
      limit: 25,
    });
  });

  it("creates a message default request with the documented message filters", () => {
    expect(createDefaultSearchRequest("message")).toEqual({
      type: "message",
      q: "invoice",
      filters: {
        username: "sender_name",
        chat_id: "123456789",
        containsLinks: true,
      },
      page: 1,
      limit: 25,
    });
  });

  it("normalizes explorer API keys by trimming whitespace", () => {
    expect(normalizeExplorerApiKey("  fbfb_live_test  ")).toBe("fbfb_live_test");
    expect(normalizeExplorerApiKey("   ")).toBe("");
  });

  it("builds a curl snippet for search requests with X-API-Key auth", () => {
    const snippet = buildExplorerCurlSnippet({
      apiBase: "https://fbfb.example",
      apiKey: "your_api_key",
      endpoint: "search",
      authMode: "x-api-key",
      searchBody: createDefaultSearchRequest("channel"),
    });

    expect(snippet).toContain("curl -X POST https://fbfb.example/api/v1/search");
    expect(snippet).toContain("-H \"X-API-Key: your_api_key\"");
    expect(snippet).toContain("\"type\": \"channel\"");
  });

  it("builds a fetch snippet for credits requests with bearer auth", () => {
    const snippet = buildExplorerFetchSnippet({
      apiBase: "https://fbfb.example",
      apiKey: "your_api_key",
      endpoint: "credits",
      authMode: "bearer",
      searchBody: createDefaultSearchRequest("profile"),
    });

    expect(snippet).toContain("fetch(\"https://fbfb.example/api/v1/credits\"");
    expect(snippet).toContain("\"Authorization\": \"Bearer your_api_key\"");
    expect(snippet).not.toContain("JSON.stringify");
  });
});
