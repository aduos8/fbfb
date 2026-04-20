import { router } from "../init";
import { z } from "zod";
import { getCassandraClient } from "../../lib/db-client";
import { getUserById, getUserByUsername, getChatById, listMessagesByChatBucket, listMessagesByUserBucket, getMessageById, getUserHistory, getParticipationByUser, listChatsByIds } from "../../lib/tg-queries/queries";
import { searchModeProcedure, getSearchViewerRole, getSearchViewerUserId } from "../../lib/tg-queries/searchModeProcedure";
import { applyRedactions } from "../../lib/tg-queries/redactions";
import { toApiServedAssetUrl } from "../../lib/tg-queries/storageAssets";

const cassandra = () => getCassandraClient();

function withServedAvatar<T>(record: T): T {
  if (!record || typeof record !== "object") {
    return record;
  }

  const candidate = record as Record<string, unknown>;
  if (!("avatar_url" in candidate)) {
    return record;
  }

  return {
    ...candidate,
    avatar_url: toApiServedAssetUrl(candidate.avatar_url as string | null | undefined),
  } as T;
}

async function getFullUserById(userId: string): Promise<Record<string, unknown> | null> {
  const client = cassandra();

  try {
    const [userResult, historyResult] = await Promise.all([
      client.execute(
        "SELECT user_id, avatar_url, created_at, updated_at FROM users WHERE user_id = ?",
        [userId],
        { prepare: true }
      ),
      client.execute(
        "SELECT field, new_value FROM user_history WHERE user_id = ? AND field IN ('display_name', 'bio') LIMIT 100",
        [userId],
        { prepare: true }
      ),
    ]);

    const userRow = userResult.rows[0] as any;
    if (!userRow) return null;

    const userData: Record<string, unknown> = {
      user_id: userRow.user_id,
      avatar_url: userRow.avatar_url,
      created_at: userRow.created_at,
      updated_at: userRow.updated_at,
    };

    for (const row of historyResult.rows as any[]) {
      if (row.field === 'display_name' && !userData.display_name) {
        userData.display_name = row.new_value;
      }
      if (row.field === 'bio' && !userData.bio) {
        userData.bio = row.new_value;
      }
    }

    return userData;
  } catch (err) {
    console.error("[getFullUserById] error:", err);
    return null;
  }
}

async function getFullUserByUsername(username: string): Promise<Record<string, unknown> | null> {
  const client = cassandra();

  try {
    const userByUsernameResult = await client.execute(
      "SELECT user_id, username, avatar_url FROM users_by_username WHERE username = ?",
      [username],
      { prepare: true }
    );

    const userByUsernameRow = userByUsernameResult.rows[0] as any;
    if (!userByUsernameRow) return null;

    const userId = userByUsernameRow.user_id;

    const [userResult, historyResult] = await Promise.all([
      client.execute(
        "SELECT user_id, avatar_url, created_at, updated_at FROM users WHERE user_id = ?",
        [userId],
        { prepare: true }
      ),
      client.execute(
        "SELECT field, new_value FROM user_history WHERE user_id = ? AND field IN ('display_name', 'bio') LIMIT 100",
        [userId],
        { prepare: true }
      ),
    ]);

    const userRow = userResult.rows[0] as any;

    const userData: Record<string, unknown> = {
      user_id: userId,
      username: userByUsernameRow.username,
      avatar_url: userByUsernameRow.avatar_url || (userRow?.avatar_url || null),
      created_at: userRow?.created_at || null,
      updated_at: userRow?.updated_at || null,
    };

    for (const row of historyResult.rows as any[]) {
      if (row.field === 'display_name' && !userData.display_name) {
        userData.display_name = row.new_value;
      }
      if (row.field === 'bio' && !userData.bio) {
        userData.bio = row.new_value;
      }
    }

    return userData;
  } catch (err) {
    console.error("[getFullUserByUsername] error:", err);
    return null;
  }
}

export const lookupRouter = router({
  getUser: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUser", protect: true } })
    .input(z.object({ userId: z.string() }))
    .output(z.unknown())
    .query(async ({ ctx: context, input: parsed }) => {
      const user = await getFullUserById(parsed.userId);
      if (!user) {
        return null;
      }
      return withServedAvatar(applyRedactions(user, null, getSearchViewerRole(context)));
    }),

  getUserByUsername: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserByUsername", protect: true } })
    .input(z.object({ username: z.string() }))
    .output(z.unknown())
    .query(async ({ ctx: context, input: parsed }) => {
      const username = parsed.username.replace(/^@/, "").toLowerCase();
      const user = await getFullUserByUsername(username);
      if (!user) {
        return null;
      }
      return withServedAvatar(applyRedactions(user, null, getSearchViewerRole(context)));
    }),

  getChat: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getChat", protect: true } })
    .input(z.object({ chatId: z.string() }))
    .output(z.unknown())
    .query(async ({ ctx: context, input: parsed }) => {
      const chat = await getChatById(parsed.chatId);
      if (!chat) {
        return null;
      }
      return withServedAvatar(applyRedactions(chat as Record<string, unknown>, null, getSearchViewerRole(context)));
    }),

  getMessages: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getMessages", protect: true } })
    .input(z.object({
      chatId: z.string(),
      bucket: z.string().optional(),
      limit: z.number().max(200).optional(),
    }))
    .output(z.array(z.unknown()))
    .query(async ({ ctx: context, input: parsed }) => {
      const bucket = parsed.bucket ?? new Date().toISOString().slice(0, 7).replace("-", "");
      const messages = await listMessagesByChatBucket(parsed.chatId, bucket, parsed.limit ?? 100);
      const role = getSearchViewerRole(context);
      return messages.map((message) => applyRedactions(message as Record<string, unknown>, null, role));
    }),

  getUserMessages: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserMessages", protect: true } })
    .input(z.object({
      userId: z.string(),
      bucket: z.string().optional(),
    }))
    .output(z.array(z.unknown()))
    .query(async ({ ctx: context, input: parsed }) => {
      const bucket = parsed.bucket ?? new Date().toISOString().slice(0, 7).replace("-", "");
      const messages = await listMessagesByUserBucket(parsed.userId, bucket, 100);
      const role = getSearchViewerRole(context);
      return messages.map((message) => applyRedactions(message as Record<string, unknown>, null, role));
    }),

  getMessage: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getMessage", protect: true } })
    .input(z.object({ chatId: z.string(), messageId: z.string() }))
    .output(z.unknown())
    .query(async ({ ctx: context, input: parsed }) => {
      const msg = await getMessageById(parsed.chatId, parsed.messageId);
      return applyRedactions(msg as Record<string, unknown>, null, getSearchViewerRole(context));
    }),

  getUserHistory: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserHistory", protect: true } })
    .input(z.object({ userId: z.string() }))
    .output(z.object({
      displayNameHistory: z.array(z.object({
        oldValue: z.string().nullable(),
        newValue: z.string().nullable(),
        changedAt: z.string().nullable(),
      })),
      usernameHistory: z.array(z.object({
        oldValue: z.string().nullable(),
        newValue: z.string().nullable(),
        changedAt: z.string().nullable(),
      })),
      bioHistory: z.array(z.object({
        oldValue: z.string().nullable(),
        newValue: z.string().nullable(),
        changedAt: z.string().nullable(),
      })),
    }))
    .query(async ({ input: parsed }) => {
      const history = await getUserHistory(parsed.userId);

      const displayNameHistory: { oldValue: string | null; newValue: string | null; changedAt: string | null }[] = [];
      const usernameHistory: { oldValue: string | null; newValue: string | null; changedAt: string | null }[] = [];
      const bioHistory: { oldValue: string | null; newValue: string | null; changedAt: string | null }[] = [];

      for (const row of history) {
        const entry = {
          oldValue: row.old_value ?? null,
          newValue: row.new_value ?? null,
          changedAt: row.changed_at ? new Date(row.changed_at).toISOString() : null,
        };

        switch (row.field) {
          case "display_name":
            displayNameHistory.push(entry);
            break;
          case "username":
            usernameHistory.push(entry);
            break;
          case "bio":
            bioHistory.push(entry);
            break;
        }
      }

      return { displayNameHistory, usernameHistory, bioHistory };
    }),

  getUserChats: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/lookup/getUserChats", protect: true } })
    .input(z.object({ userId: z.string() }))
    .output(z.array(z.object({
      chat_id: z.string(),
      display_name: z.string().nullable(),
      username: z.string().nullable(),
      chat_type: z.string().nullable(),
      message_count: z.number(),
    })))
    .query(async ({ input: parsed }) => {
      const participation = await getParticipationByUser(parsed.userId);

      if (participation.length === 0) {
        return [];
      }

      const chatIds = participation.map(p => p.chat_id);
      const chats = await listChatsByIds(chatIds);
      const chatMap = new Map(chats.map(c => [c.chat_id, c]));

      return participation.map(p => {
        const chat = chatMap.get(p.chat_id);
        return {
          chat_id: p.chat_id,
          display_name: chat?.display_name ?? null,
          username: chat?.username ?? null,
          chat_type: chat?.chat_type ?? null,
          message_count: p.message_count,
        };
      });
    }),
});
