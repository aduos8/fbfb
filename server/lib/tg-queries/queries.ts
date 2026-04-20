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
  phone_number?: string;
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
    "SELECT * FROM users_by_username WHERE username = ?",
    [username],
    { prepare: true }
  );
  return (result.rows[0] as unknown as UserRecord) ?? null;
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
    const [byUsername, byDisplayName, byBio] = await Promise.all([
      client.execute(
        `SELECT user_id, search_username, search_display_name, search_bio FROM users_search WHERE search_username LIKE ?`,
        [likeQuery],
        { prepare: true }
      ).catch(() => ({ rows: [] })),
      client.execute(
        `SELECT user_id, search_username, search_display_name, search_bio FROM users_search WHERE search_display_name LIKE ?`,
        [likeQuery],
        { prepare: true }
      ).catch(() => ({ rows: [] })),
      client.execute(
        `SELECT user_id, search_username, search_display_name, search_bio FROM users_search WHERE search_bio LIKE ?`,
        [likeQuery],
        { prepare: true }
      ).catch(() => ({ rows: [] })),
    ]);

    const allRows = [...byUsername.rows, ...byDisplayName.rows, ...byBio.rows];

    if (allRows.length === 0) {
      return { results: [], total: 0 };
    }

    const uniqueRows: Map<string, any> = new Map();
    for (const row of allRows) {
      const r = row as any;
      if (!uniqueRows.has(r.user_id)) {
        uniqueRows.set(r.user_id, r);
      }
    }

    const total = uniqueRows.size;
    const paginatedRows = Array.from(uniqueRows.values()).slice(offset, offset + limit);

    if (paginatedRows.length === 0) {
      return { results: [], total };
    }

    const userIds = paginatedRows.map(row => row.user_id);

    const userInfos = await client.execute(
      `SELECT user_id, avatar_url FROM users WHERE user_id IN ?`,
      [userIds],
      { prepare: true }
    );

    const userMap = new Map<string, any>();
    for (const row of userInfos.rows) {
      const r = row as any;
      userMap.set(r.user_id, { user_id: r.user_id, avatar_url: r.avatar_url });
    }

    const results: UserRecord[] = [];

    for (const row of paginatedRows) {
      const r = row as any;
      const userInfo = userMap.get(r.user_id) || {};

      results.push({
        user_id: r.user_id,
        username: r.search_username,
        display_name: r.search_display_name,
        bio: r.search_bio,
        avatar_url: userInfo.avatar_url,
      });
    }

    return { results, total };
  } catch (err: any) {
    console.error("[searchUsers] error:", err.message);
    return { results: [], total: 0 };
  }
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
    const [byUsername, byDisplayName, byBio] = await Promise.all([
      client.execute(
        `SELECT chat_id, search_username, search_display_name, search_bio FROM chats_search WHERE search_username LIKE ?`,
        [likeQuery],
        { prepare: true }
      ).catch(() => ({ rows: [] })),
      client.execute(
        `SELECT chat_id, search_username, search_display_name, search_bio FROM chats_search WHERE search_display_name LIKE ?`,
        [likeQuery],
        { prepare: true }
      ).catch(() => ({ rows: [] })),
      client.execute(
        `SELECT chat_id, search_username, search_display_name, search_bio FROM chats_search WHERE search_bio LIKE ?`,
        [likeQuery],
        { prepare: true }
      ).catch(() => ({ rows: [] })),
    ]);

    const allRows = [...byUsername.rows, ...byDisplayName.rows, ...byBio.rows];

    if (allRows.length === 0) {
      return { results: [], total: 0 };
    }

    const uniqueRows: Map<string, any> = new Map();
    for (const row of allRows) {
      const r = row as any;
      if (!uniqueRows.has(r.chat_id)) {
        uniqueRows.set(r.chat_id, r);
      }
    }

    const total = uniqueRows.size;
    const paginatedRows = Array.from(uniqueRows.values()).slice(offset, offset + limit);

    if (paginatedRows.length === 0) {
      return { results: [], total };
    }

    const chatIds = paginatedRows.map(row => row.chat_id);

    const chatInfos = await client.execute(
      `SELECT chat_id, chat_type, username, display_name, member_count, bio, avatar_url FROM chats WHERE chat_id IN ?`,
      [chatIds],
      { prepare: true }
    );

    const chatMap = new Map<string, any>();
    for (const row of chatInfos.rows) {
      const r = row as any;
      chatMap.set(r.chat_id, r);
    }

    const results: ChatRecord[] = [];

    for (const row of paginatedRows) {
      const r = row as any;
      const chatId = r.chat_id;

      const chatInfo = chatMap.get(chatId);
      if (!chatInfo) continue;

      if (chatType && chatInfo.chat_type !== chatType) continue;

      results.push({
        chat_id: chatId,
        chat_type: chatInfo.chat_type,
        username: r.search_username || chatInfo.username,
        display_name: r.search_display_name || chatInfo.display_name,
        bio: r.search_bio || chatInfo.bio,
        member_count: chatInfo.member_count,
        avatar_url: chatInfo.avatar_url,
      });
    }

    return { results, total };
  } catch (err: any) {
    console.error("[searchChats] error:", err.message);
    return { results: [], total: 0 };
  }
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
