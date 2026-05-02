import { describe, expect, it } from "vitest";
import { AGENTS_PLACEHOLDERS, buildPublicApiAgentsTemplate } from "./publicApiAgents";

describe("publicApiAgents template", () => {
  it("includes the stable production endpoints and auth guidance", () => {
    const template = buildPublicApiAgentsTemplate("https://api.example.com");

    expect(template).toContain("POST /api/v1/search");
    expect(template).toContain("GET /api/v1/credits");
    expect(template).toContain("X-API-Key");
    expect(template).toContain("Authorization: Bearer <key>");
  });

  it("includes placeholder values that users can replace in their own app", () => {
    const template = buildPublicApiAgentsTemplate("https://api.example.com");

    expect(template).toContain("https://api.example.com");
    expect(template).toContain(AGENTS_PLACEHOLDERS.apiKeyEnvVar);
  });

  it("documents credit semantics, rate limits, and redactions", () => {
    const template = buildPublicApiAgentsTemplate("https://api.example.com");

    expect(template).toContain("Page 1 searches deduct one credit");
    expect(template).toContain("rate_limited");
    expect(template).toContain("Respect redacted responses");
  });
});
