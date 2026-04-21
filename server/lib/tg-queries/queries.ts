import { Client, auth } from "cassandra-driver";

const DEFAULT_KEYSPACE = "tgosint";
let sharedClient: Client | null = null;

function getClient(): Client {
  if (!sharedClient) {
    const contactPoints = (process.env.CASSANDRA_CONTACT_POINTS || "localhost").split(",").map(v => v.trim()).filter(Boolean);
    const keyspace = process.env.CASSANDRA_KEYSPACE || DEFAULT_KEYSPACE;
    const username = process.env.CASSANDRA_USERNAME || "";
    const password = process.env.CASSANDRA_PASSWORD || "";

    const options: Record<string, unknown> = {
      contactPoints,
      localDataCenter: process.env.CASSANDRA_LOCAL_DC || "datacenter1",
      keyspace,
      pooling: {
        maxRequestsPerConnection: 1024,
      },
    };

    if (username && password) {
      options.authProvider = new auth.PlainTextAuthProvider(username, password);
    }

    sharedClient = new Client(options);
  }
  return sharedClient;
}

export function getCassandraClient() {
  return getClient();
}

export async function shutdownCassandra() {
  if (sharedClient) {
    await sharedClient.shutdown();
    sharedClient = null;
  }
}

export type UserRecord = {
  user_id: string;
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  photo_id?: string;
  phone_hash?: string;
  phone_masked?: string;
  is_premium?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

export type ChatRecord = {
  chat_id: string;
  chat_type?: string;
  username?: string;
  display_name?: string;
  bio?: string;
  member_count?: number;
  participants_count?: number;
  avatar_url?: string;
  created_at?: Date;
  updated_at?: Date;
};

export type MessageRecord = {
  message_id: string;
  chat_id: string;
  user_id?: string;
  content?: string;
  timestamp?: Date;
  created_at?: Date;
  has_media?: boolean;
  media_type?: string;
  media_file_id?: string;
  media_url?: string;
  bucket?: string;
};

export type ParticipationMetaRecord = {
  user_id: string;
  chat_id: string;
  first_message_at?: Date;
  last_message_at?: Date;
  joined_at?: Date;
};

export type HistoryRecord = {
  user_id: string;
  changed_at: Date;
  field: string;
  id: string;
  old_value?: string;
  new_value?: string;
};

export type WordStatRecord = {
  word: string;
  count: number;
};

// User queries
export async function getUserById(userId: number | string): Promise<UserRecord | null> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM users WHERE user_id = ?",
    [String(userId)],
    { prepare: true }
  );
  return (result.rows[0] as unknown as UserRecord) ?? null;
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const client = getClient();
  const result = await client.execute(
    "SELECT user_id FROM users_by_username WHERE username = ? LIMIT 1",
    [username],
    { prepare: true }
  );
  const row = result.rows[0] as { user_id?: string } | undefined;
  if (!row?.user_id) {
    return null;
  }

  return getUserById(row.user_id);
}

export async function listUsersByIds(userIds: Array<number | string>): Promise<UserRecord[]> {
  if (userIds.length === 0) return [];
  const client = getClient();
  const placeholders = userIds.map(() => "?").join(",");
  const result = await client.execute(
    `SELECT * FROM users WHERE user_id IN (${placeholders})`,
    userIds.map(id => String(id)),
    { prepare: true }
  );
  return result.rows as unknown as UserRecord[];
}

export async function searchUsers(query: string, limit = 25, offset = 0): Promise<{ results: UserRecord[]; total: number }> {
  const client = getClient();
  const likeQuery = `%${query.toLowerCase()}%`;

  try {
    const result = await client.execute(
      "SELECT * FROM users WHERE username LIKE ? OR display_name LIKE ? OR bio LIKE ? LIMIT ? ALLOW FILTERING",
      [likeQuery, likeQuery, likeQuery, Math.max(limit + offset, limit)],
      { prepare: true }
    );
    const allRows = result.rows as unknown as UserRecord[];

    if (allRows.length === 0) {
      return { results: [], total: 0 };
    }

    const uniqueRows: Map<string, UserRecord> = new Map();
    for (const row of allRows) {
      if (!uniqueRows.has(row.user_id)) {
        uniqueRows.set(row.user_id, row);
      }
    }

    const total = uniqueRows.size;
    const paginatedRows = Array.from(uniqueRows.values()).slice(offset, offset + limit);
    return { results: paginatedRows, total };
  } catch (err: any) {
    console.error("[searchUsers] error:", err.message);
    return { results: [], total: 0 };
  }
}

export async function listAllUsers(): Promise<UserRecord[]> {
  const client = getClient();
  const result = await client.execute("SELECT * FROM users", [], { fetchSize: 500000 });
  return result.rows as unknown as UserRecord[];
}

// Chat queries
export async function getChatById(chatId: number | string): Promise<ChatRecord | null> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM chats WHERE chat_id = ?",
    [String(chatId)],
    { prepare: true }
  );
  return (result.rows[0] as unknown as ChatRecord) ?? null;
}

export async function listChatsByIds(chatIds: Array<number | string>): Promise<ChatRecord[]> {
  if (chatIds.length === 0) return [];
  const client = getClient();
  const placeholders = chatIds.map(() => "?").join(",");
  const result = await client.execute(
    `SELECT * FROM chats WHERE chat_id IN (${placeholders})`,
    chatIds.map(id => String(id)),
    { prepare: true }
  );
  return result.rows as unknown as ChatRecord[];
}

export async function searchChats(query: string, chatType?: string, limit = 25, offset = 0): Promise<{ results: ChatRecord[]; total: number }> {
  const client = getClient();
  const likeQuery = `%${query.toLowerCase()}%`;

  try {
    const result = await client.execute(
      "SELECT * FROM chats WHERE username LIKE ? OR display_name LIKE ? OR bio LIKE ? LIMIT ? ALLOW FILTERING",
      [likeQuery, likeQuery, likeQuery, Math.max(limit + offset, limit)],
      { prepare: true }
    );
    const allRows = result.rows as unknown as ChatRecord[];

    if (allRows.length === 0) {
      return { results: [], total: 0 };
    }

    const uniqueRows: Map<string, ChatRecord> = new Map();
    for (const row of allRows) {
      if (!uniqueRows.has(row.chat_id)) {
        uniqueRows.set(row.chat_id, row);
      }
    }

    const results = Array.from(uniqueRows.values())
      .filter((row) => !chatType || row.chat_type === chatType)
      .slice(offset, offset + limit);
    const total = Array.from(uniqueRows.values()).filter((row) => !chatType || row.chat_type === chatType).length;
    return { results, total };
  } catch (err: any) {
    console.error("[searchChats] error:", err.message);
    return { results: [], total: 0 };
  }
}

export async function listAllChats(): Promise<ChatRecord[]> {
  const client = getClient();
  const result = await client.execute("SELECT * FROM chats", [], { fetchSize: 10000 });
  const chats = [...result.rows];

  while (result.nextPage) {
    const next = await result.nextPage();
    chats.push(...next.rows);
  }

  return chats as unknown as ChatRecord[];
}

// Message queries
export async function getMessageById(chatId: number | string, messageId: number | string): Promise<MessageRecord | null> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_id WHERE chat_id = ? AND message_id = ?",
    [String(chatId), String(messageId)],
    { prepare: true }
  );
  return (result.rows[0] as unknown as MessageRecord) ?? null;
}

export async function listMessagesByChatBucket(chatId: number | string, bucket: string, limit = 100): Promise<MessageRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_chat WHERE chat_id = ? AND bucket = ? LIMIT ?",
    [String(chatId), bucket, limit],
    { prepare: true }
  );
  return result.rows as unknown as MessageRecord[];
}

export async function listMessagesByUserBucket(userId: number | string, bucket: string, limit = 100): Promise<MessageRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_user WHERE user_id = ? AND bucket = ? LIMIT ?",
    [String(userId), bucket, limit],
    { prepare: true }
  );
  return result.rows as unknown as MessageRecord[];
}

export async function searchMessages(keyword: string, limit = 100): Promise<MessageRecord[]> {
  const client = getClient();
  const likeQuery = `%${keyword}%`;

  try {
    const result = await client.execute(
      "SELECT chat_id, message_id, user_id, content, has_media, timestamp FROM messages_by_id WHERE content LIKE ? LIMIT ? ALLOW FILTERING",
      [likeQuery, limit],
      { prepare: true }
    );
    return result.rows as unknown as MessageRecord[];
  } catch (error) {
    console.warn("Message search failed (SASI indexes may not be enabled):", error);
    return [];
  }
}

export async function listAllMessages(): Promise<MessageRecord[]> {
  const client = getClient();
  const result = await client.execute("SELECT * FROM messages_by_id ALLOW FILTERING", [], { fetchSize: 10000 });
  const messages = [...result.rows];

  while (result.nextPage) {
    const next = await result.nextPage();
    messages.push(...next.rows);
  }

  return messages as unknown as MessageRecord[];
}

// Participation queries
export async function getParticipationMetaByUser(userId: number | string): Promise<ParticipationMetaRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM participation_meta WHERE user_id = ?",
    [String(userId)],
    { prepare: true }
  );
  return result.rows as unknown as ParticipationMetaRecord[];
}

export async function getParticipationByUser(userId: number | string): Promise<{ chat_id: string; message_count: number }[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT chat_id, message_count FROM participation WHERE user_id = ?",
    [String(userId)],
    { prepare: true }
  );
  return result.rows as unknown as { chat_id: string; message_count: number }[];
}

// History queries
export async function getUserHistory(userId: number | string): Promise<HistoryRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM user_history WHERE user_id = ? ORDER BY changed_at DESC",
    [String(userId)],
    { prepare: true }
  );
  return result.rows as unknown as HistoryRecord[];
}

export type HistoryChange = {
  field: string;
  old_value: string | null;
  new_value: string;
  changed_at: Date;
};

export async function getUserHistorySince(
  userId: number | string,
  since: Date
): Promise<HistoryChange[]> {
  const client = getClient();
  const sinceTimestamp = since.toISOString();

  const result = await client.execute(
    "SELECT field, old_value, new_value, changed_at FROM user_history WHERE user_id = ? AND changed_at > ? ORDER BY changed_at ASC",
    [String(userId), sinceTimestamp],
    { prepare: true }
  );

  return result.rows.map(row => ({
    field: row.field as string,
    old_value: row.old_value as string | null,
    new_value: row.new_value as string,
    changed_at: row.changed_at as Date,
  }));
}

export type HistoryRecordLight = {
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: Date;
};

export async function getUserHistoryForBatch(userIds: string[]): Promise<Map<string, HistoryRecordLight[]>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const client = getClient();
  const BATCH_SIZE = 100;
  const map = new Map<string, HistoryRecordLight[]>();

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, idx) => `?`).join(", ");

    try {
      const result = await client.execute(
        `SELECT user_id, field, old_value, new_value, changed_at FROM user_history WHERE user_id IN (${placeholders})`,
        batch,
        { prepare: true }
      );

      for (const row of result.rows) {
        const uid = row.user_id as string;
        if (!map.has(uid)) {
          map.set(uid, []);
        }
        map.get(uid)!.push({
          field: row.field as string,
          old_value: row.old_value as string | null,
          new_value: row.new_value as string | null,
          changed_at: row.changed_at as Date,
        });
      }
    } catch (error) {
      console.error(`Error fetching history batch ${i}-${i + BATCH_SIZE}:`, error);
    }
  }

  return map;
}

// Word stats queries
export async function getUserWordStats(userId: number | string, limit = 50): Promise<WordStatRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT word, count FROM user_word_stats WHERE user_id = ? LIMIT ?",
    [String(userId), limit],
    { prepare: true }
  );
  return result.rows as unknown as WordStatRecord[];
}

export async function getChatWordStats(chatId: number | string, limit = 50): Promise<WordStatRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT word, count FROM chat_word_stats WHERE chat_id = ? LIMIT ?",
    [String(chatId), limit],
    { prepare: true }
  );
  return result.rows as unknown as WordStatRecord[];
}

// Normalize entity ID
export function normalizeEntityId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value);
  if (!str) return null;
  if (str.startsWith("-100")) return str;
  const num = Number(str);
  if (!isNaN(num)) return String(num);
  return str;
}
