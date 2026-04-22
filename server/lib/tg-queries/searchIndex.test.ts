import { describe, expect, it } from "vitest";
import { MESSAGE_SEARCHABLE_ATTRIBUTES } from "./searchIndex";

describe("message index settings", () => {
  it("keep message content searchable", () => {
    expect(MESSAGE_SEARCHABLE_ATTRIBUTES).toContain("content");
  });
});
