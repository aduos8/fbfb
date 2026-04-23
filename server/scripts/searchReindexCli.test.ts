import { describe, expect, it } from "vitest";

import {
  getSearchReindexCliArgs,
  hasCliFlag,
  parseRunIdFromArgs,
  parseScopesFromArgs,
} from "./searchReindexCli";

describe("search reindex CLI parsing", () => {
  it("parses resume and run-id flags from bun script argv", () => {
    const argv = getSearchReindexCliArgs(
      ["/usr/bin/bun", "/app/server/scripts/search-reindex.ts", "--resume", "--run-id=dc793b874cda4301"],
      ["/usr/bin/bun", "/app/server/scripts/search-reindex.ts", "--resume", "--run-id=dc793b874cda4301"]
    );

    expect(hasCliFlag(argv, "--resume")).toBe(true);
    expect(parseRunIdFromArgs(argv)).toBe("dc793b874cda4301");
  });

  it("parses split flag values and scope lists", () => {
    const argv = getSearchReindexCliArgs(
      ["/usr/bin/bun", "/app/server/scripts/search-reindex.ts", "--resume", "--run-id", "run-123", "--scopes", "profiles,chats"],
      []
    );

    expect(hasCliFlag(argv, "--resume")).toBe(true);
    expect(parseRunIdFromArgs(argv)).toBe("run-123");
    expect(parseScopesFromArgs(argv)).toEqual(["profiles", "chats"]);
  });

  it("normalizes quoted sh -c arguments", () => {
    const argv = getSearchReindexCliArgs(
      ["/usr/bin/bun", "/app/server/scripts/search-reindex.ts", "--resume", "\"--run-id=dc793b874cda4301\""],
      []
    );

    expect(parseRunIdFromArgs(argv)).toBe("dc793b874cda4301");
  });
});
