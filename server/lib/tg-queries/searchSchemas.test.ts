import { describe, expect, it } from "vitest";
import {
  channelSearchSchema,
  messageSearchSchema,
  profileSearchSchema,
} from "./searchSchemas";

describe("searchSchemas alias normalization", () => {
  it("normalizes spec profile filter aliases into canonical fields", () => {
    const parsed = profileSearchSchema.parse({
      type: "profile",
      filters: {
        username: "alice",
        display_name: "Alice",
        number: "+1 555 000 0000",
        bio: "builder",
        user_id: "12345",
      },
    });

    expect(parsed.filters).toEqual({
      username: "alice",
      displayName: "Alice",
      phone: "+1 555 000 0000",
      bio: "builder",
      userId: "12345",
    });
  });

  it("keeps current channel filter keys working while accepting spec aliases", () => {
    const parsed = channelSearchSchema.parse({
      type: "channel",
      filters: {
        display_name: "Tech Daily",
        bio: "news",
        channelId: "777",
      },
    });

    expect(parsed.filters).toEqual({
      username: undefined,
      title: "Tech Daily",
      description: "news",
      channelId: "777",
    });
  });

  it("normalizes message aliases while preserving advanced filters", () => {
    const parsed = messageSearchSchema.parse({
      type: "message",
      filters: {
        username: "sender_name",
        user_id: "42",
        chat_id: "84",
        keyword: "alpha",
        hasMedia: true,
        containsLinks: false,
        minLength: 12,
      },
    });

    expect(parsed.filters).toEqual({
      senderUsername: "sender_name",
      senderUserId: "42",
      chatId: "84",
      keyword: "alpha",
      dateStart: undefined,
      dateEnd: undefined,
      hasMedia: true,
      containsLinks: false,
      minLength: 12,
    });
  });
});
