import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));

vi.mock("../db", () => ({
  sql: dbMocks.sql,
}));

const {
  getActiveSearchShadowIndex,
  getLatestResumableFullReindex,
  getLatestRunningFullReindex,
  getSearchIndexRunByShadowHint,
} = await import("./searchIndexing");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchIndexing run selection", () => {
  it("skips resumable full reindex rows that do not have stored shadow indexes", async () => {
    dbMocks.sql.mockResolvedValue([
      {
        id: "run-bad",
        mode: "full_reindex",
        status: "running",
        scopes: ["profiles", "chats", "messages"],
        metadata: {},
      },
      {
        id: "run-good",
        mode: "full_reindex",
        status: "failed",
        scopes: ["profiles", "chats", "messages"],
        metadata: {
          shadowIndexes: {
            profiles: "profiles__shadow_good",
            chats: "chats__shadow_good",
            messages: "messages__shadow_good",
          },
        },
      },
    ]);

    const run = await getLatestResumableFullReindex();

    expect(run?.id).toBe("run-good");
  });

  it("skips running full reindex rows without shadow indexes when choosing the active shadow alias", async () => {
    dbMocks.sql.mockResolvedValue([
      {
        id: "run-bad",
        mode: "full_reindex",
        status: "running",
        scopes: ["profiles", "chats", "messages"],
        metadata: {},
      },
      {
        id: "run-good",
        mode: "full_reindex",
        status: "running",
        scopes: ["profiles", "chats", "messages"],
        metadata: {
          shadowIndexes: {
            profiles: "profiles__shadow_good",
            chats: "chats__shadow_good",
            messages: "messages__shadow_good",
          },
        },
      },
    ]);

    const run = await getLatestRunningFullReindex();
    const shadowIndex = await getActiveSearchShadowIndex("profiles");

    expect(run?.id).toBe("run-good");
    expect(shadowIndex).toBe("profiles__shadow_good");
  });

  it("can find a full reindex run by the shadow suffix derived from its uuid", async () => {
    dbMocks.sql.mockResolvedValue([
      {
        id: "dc793b87-4cda-4301-9b0f-123456789abc",
        mode: "full_reindex",
        status: "running",
        scopes: ["profiles", "chats", "messages"],
        metadata: {},
      },
    ]);

    const run = await getSearchIndexRunByShadowHint("dc793b874cda4301");

    expect(run?.id).toBe("dc793b87-4cda-4301-9b0f-123456789abc");
  });
});
