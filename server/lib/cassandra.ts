import { Client } from "cassandra-driver";

const CASSANDRA_HOSTS = process.env.CASSANDRA_HOSTS || "localhost:9042";
const CASSANDRA_KEYSPACE = process.env.CASSANDRA_KEYSPACE || "tgosint";
const CASSANDRA_USER = process.env.CASSANDRA_USER || "cassandra";
const CASSANDRA_PASSWORD = process.env.CASSANDRA_PASSWORD || "cassandra";

const cassandraClient = new Client({
  contactPoints: CASSANDRA_HOSTS.split(","),
  localDataCenter: "datacenter1",
  credentials: {
    username: CASSANDRA_USER,
    password: CASSANDRA_PASSWORD,
  },
  keyspace: CASSANDRA_KEYSPACE,
  pooling: {
    maxRequestsPerConnection: 1024,
  },
});

export const cassandraSession = cassandraClient;

export async function queryCassandra<T>(
  cql: string,
  params?: (string | number | boolean | Date | null)[]
): Promise<T[]> {
  const result = await cassandraSession.execute(cql, params, { prepare: true });
  return result.rows as unknown as T[];
}

export async function getUserById(userId: string) {
  const rows = await queryCassandra<{
    user_id: string;
    username: string;
    display_name: string;
    bio: string;
    avatar_url: string;
    photo_id: string;
    phone_number: string;
    created_at: Date;
    updated_at: Date;
  }>(
    "SELECT user_id, username, display_name, bio, avatar_url, photo_id, phone_number, created_at, updated_at FROM users WHERE user_id = ?",
    [userId]
  );

  if (!rows[0]) return null;

  const user = rows[0];

  const historyRows = await queryCassandra<{
    field: string;
    new_value: string;
    changed_at: Date;
  }>(
    "SELECT field, new_value, changed_at FROM user_history WHERE user_id = ? ORDER BY changed_at DESC",
    [userId]
  );

  let latestDisplayName: string | null = null;
  let latestDisplayNameTime: Date | null = null;
  let latestBio: string | null = null;
  let latestBioTime: Date | null = null;

  for (const row of historyRows) {
    if (row.field === 'display_name') {
      if (!latestDisplayNameTime || row.changed_at > latestDisplayNameTime) {
        latestDisplayName = row.new_value;
        latestDisplayNameTime = row.changed_at;
      }
    } else if (row.field === 'bio') {
      if (!latestBioTime || row.changed_at > latestBioTime) {
        latestBio = row.new_value;
        latestBioTime = row.changed_at;
      }
    }
  }

  if (latestDisplayName) {
    user.display_name = latestDisplayName;
  }
  if (latestBio) {
    user.bio = latestBio;
  }

  const historyMap = getUserHistoryMapFromRows(historyRows);
  const usernamesField = historyMap["usernames"];
  if (usernamesField) {
    try {
      const usernames = JSON.parse(usernamesField);
      (user as any).username = Array.isArray(usernames) ? usernames[usernames.length - 1] : usernamesField;
    } catch {
      (user as any).username = usernamesField;
    }
  }

  return user;
}

function getUserHistoryMapFromRows(rows: { field: string; new_value: string; changed_at: Date }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!(row.field in map)) {
      map[row.field] = row.new_value;
    }
  }
  return map;
}

interface UserHistoryEntry {
  field: string;
  new_value: string;
  changed_at: Date;
}

async function getUserHistoryMap(userId: string): Promise<Record<string, string>> {
  const rows = await queryCassandra<UserHistoryEntry>(
    "SELECT field, new_value, changed_at FROM user_history WHERE user_id = ? ORDER BY changed_at DESC",
    [userId]
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!(row.field in map)) {
      map[row.field] = row.new_value;
    }
  }
  return map;
}

export async function debugUserHistory(userId: string) {
  const rows = await queryCassandra<{
    field: string;
    new_value: string;
    changed_at: Date;
  }>(
    "SELECT field, new_value, changed_at FROM user_history WHERE user_id = ?",
    [userId]
  );
  console.log("[debugUserHistory] All history for user", userId, ":", rows);
  return rows;
}

interface SearchFilters {
  username?: string;
  displayName?: string;
  phone?: string;
  bio?: string;
  userId?: string;
}

export async function searchUsersByUsername(query: string, limit = 100000, filters?: SearchFilters) {
  console.log("[searchUsersByUsername] Query:", query, "Filters:", filters);

  const allRows: any[] = [];

  if (query) {
    const likeQuery = `%${query.toLowerCase()}%`;
    const usernameRows = await queryCassandra<any>(
      "SELECT user_id, username, display_name, bio, avatar_url, photo_id, phone_number, created_at, updated_at FROM users WHERE username LIKE ? LIMIT ? ALLOW FILTERING",
      [likeQuery, limit]
    );
    const displayNameRows = await queryCassandra<any>(
      "SELECT user_id, username, display_name, bio, avatar_url, photo_id, phone_number, created_at, updated_at FROM users WHERE display_name LIKE ? LIMIT ? ALLOW FILTERING",
      [likeQuery, limit]
    );
    allRows.push(...usernameRows, ...displayNameRows);
  }

  if (filters?.userId) {
    const userIdRows = await queryCassandra<any>(
      "SELECT user_id, username, display_name, bio, avatar_url, photo_id, phone_number, created_at, updated_at FROM users WHERE user_id = ? LIMIT ?",
      [filters.userId, limit]
    );
    allRows.push(...userIdRows);
  }

  if (filters?.username && filters.username !== query) {
    const usernameFilterRows = await queryCassandra<any>(
      "SELECT user_id, username, display_name, bio, avatar_url, photo_id, phone_number, created_at, updated_at FROM users WHERE username LIKE ? LIMIT ? ALLOW FILTERING",
      [`%${filters.username.toLowerCase()}%`, limit]
    );
    allRows.push(...usernameFilterRows);
  }

  if (filters?.displayName && filters.displayName !== query) {
    const displayNameFilterRows = await queryCassandra<any>(
      "SELECT user_id, username, display_name, bio, avatar_url, photo_id, phone_number, created_at, updated_at FROM users WHERE display_name LIKE ? LIMIT ? ALLOW FILTERING",
      [`%${filters.displayName.toLowerCase()}%`, limit]
    );
    allRows.push(...displayNameFilterRows);
  }

  const userMap = new Map<string, any>();
  for (const row of allRows) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, row);
    }
  }

  const rows = Array.from(userMap.values()).slice(0, limit);

  console.log("[searchUsersByUsername] Found:", rows.length, "users");

  if (rows.length === 0) {
    return rows;
  }

  const userIds = rows.map(u => u.user_id);

  const placeholders = userIds.map(() => "?").join(",");
  const historyRows = await queryCassandra<{
    user_id: string;
    field: string;
    new_value: string;
    changed_at: Date;
  }>(
    `SELECT user_id, field, new_value, changed_at FROM user_history WHERE user_id IN (${placeholders})`,
    userIds as any[]
  );

  const historyByUser: Record<string, Record<string, { value: string; changed_at: Date }>> = {};
  for (const h of historyRows) {
    if (!historyByUser[h.user_id]) {
      historyByUser[h.user_id] = {};
    }
    if (!(h.field in historyByUser[h.user_id])) {
      historyByUser[h.user_id][h.field] = { value: h.new_value, changed_at: h.changed_at };
    } else if (h.changed_at > historyByUser[h.user_id][h.field].changed_at) {
      historyByUser[h.user_id][h.field] = { value: h.new_value, changed_at: h.changed_at };
    }
  }

  for (const user of rows) {
    const historyMap = historyByUser[user.user_id] || {};
    const bioEntry = historyMap["bio"];
    const displayNameEntry = historyMap["display_name"];
    const usernameEntry = historyMap["usernames"];
    if (bioEntry) {
      (user as any).bio = bioEntry.value;
    }
    if (displayNameEntry) {
      (user as any).display_name = displayNameEntry.value;
    }
    if (usernameEntry) {
      try {
        const usernames = JSON.parse(usernameEntry.value);
        (user as any).username = Array.isArray(usernames) ? usernames[usernames.length - 1] : usernames;
      } catch {
        (user as any).username = usernameEntry.value;
      }
    }
  }

  console.log("[searchUsersByUsername] Sample results:", rows.slice(0, 3).map(u => ({ username: u.username, display_name: (u as any).display_name, bio: (u as any).bio })));
  return rows;
}

export async function searchUsersByDisplayName(query: string, limit = 100000) {
  const likeQuery = `%${query}%`;
  const rows = await queryCassandra<{
    user_id: string;
    username: string;
    display_name: string;
    bio: string;
    avatar_url: string;
    photo_id: string;
    phone_number: string;
    created_at: Date;
    updated_at: Date;
  }>(
    "SELECT user_id, username, display_name, bio, avatar_url, photo_id, phone_number, created_at, updated_at FROM users WHERE display_name LIKE ? LIMIT 100000 ALLOW FILTERING",
    [likeQuery]
  );
  return rows;
}

export async function searchChats(query: string, limit = 100000, filters?: Record<string, string>) {
  const allRows: any[] = [];

  if (query) {
    const likeQuery = `%${query}%`;
    const displayNameRows = await queryCassandra<any>(
      "SELECT chat_id, username, display_name, bio, chat_type, member_count, avatar_url FROM chats WHERE display_name LIKE ? LIMIT 100000 ALLOW FILTERING",
      [likeQuery]
    );
    const usernameRows = await queryCassandra<any>(
      "SELECT chat_id, username, display_name, bio, chat_type, member_count, avatar_url FROM chats WHERE username LIKE ? LIMIT 100000 ALLOW FILTERING",
      [likeQuery]
    );
    allRows.push(...displayNameRows, ...usernameRows);
  }

  if (filters?.channelName || filters?.groupName) {
    const nameQuery = filters.channelName || filters.groupName;
    const likeQuery = `%${nameQuery}%`;
    const nameRows = await queryCassandra<any>(
      "SELECT chat_id, username, display_name, bio, chat_type, member_count, avatar_url FROM chats WHERE display_name LIKE ? OR username LIKE ? LIMIT 100000 ALLOW FILTERING",
      [likeQuery, likeQuery]
    );
    allRows.push(...nameRows);
  }

  if (filters?.channelId || filters?.groupId) {
    const idQuery = filters.channelId || filters.groupId;
    const idRows = await queryCassandra<any>(
      "SELECT chat_id, username, display_name, bio, chat_type, member_count, avatar_url FROM chats WHERE chat_id = ?",
      [idQuery]
    );
    allRows.push(...idRows);
  }

  if (filters?.description) {
    const descRows = await queryCassandra<any>(
      "SELECT chat_id, username, display_name, bio, chat_type, member_count, avatar_url FROM chats WHERE bio LIKE ? LIMIT 100000 ALLOW FILTERING",
      [`%${filters.description}%`]
    );
    allRows.push(...descRows);
  }

  const chatMap = new Map<string, any>();
  for (const row of allRows) {
    if (!chatMap.has(row.chat_id)) {
      chatMap.set(row.chat_id, row);
    }
  }

  return Array.from(chatMap.values()).slice(0, limit);
}

export async function searchMessages(query: string, limit = 100000) {
  const likeQuery = `%${query}%`;
  const rows = await queryCassandra<{
    chat_id: string;
    user_id: string;
    content: string;
    timestamp: Date;
    message_id: string;
    has_media: boolean;
  }>(
    "SELECT chat_id, user_id, content, timestamp, message_id, has_media FROM messages_by_id WHERE content LIKE ? LIMIT 100000",
    [likeQuery]
  );
  return rows;
}

export async function getUserMessages(userId: string, limit = 50) {
  const rows = await queryCassandra<{
    chat_id: string;
    content: string;
    timestamp: Date;
    message_id: string;
    has_media: boolean;
  }>(
    "SELECT chat_id, content, timestamp, message_id, has_media FROM messages_by_user WHERE user_id = ? LIMIT ?",
    [userId, limit]
  );
  return rows;
}

export async function getChatMessages(chatId: string, limit = 50) {
  const rows = await queryCassandra<{
    user_id: string;
    content: string;
    timestamp: Date;
    message_id: string;
    has_media: boolean;
  }>(
    "SELECT user_id, content, timestamp, message_id, has_media FROM messages_by_chat WHERE chat_id = ? LIMIT ?",
    [chatId, limit]
  );
  return rows;
}

export async function getUserHistory(userId: string, limit = 50) {
  const rows = await queryCassandra<{
    changed_at: Date;
    field: string;
    old_value: string;
    new_value: string;
  }>(
    "SELECT changed_at, field, old_value, new_value FROM user_history WHERE user_id = ? LIMIT ?",
    [userId, limit]
  );
  return rows;
}

export async function getUserAnalytics(userId: string) {
  try {
    const rows = await queryCassandra<{
      stats: string;
      stats_30d: string;
      chats: string;
      most_used_words: string;
      cached_at: Date;
    }>(
      "SELECT stats, stats_30d, chats, most_used_words, cached_at FROM analytics_cache WHERE user_id = ?",
      [userId]
    );
    return rows[0] || null;
  } catch (e) {
    console.error("Error fetching user analytics:", e);
    return null;
  }
}

export async function getUserParticipation(userId: string) {
  const rows = await queryCassandra<{
    chat_id: string;
    message_count: number;
  }>(
    "SELECT chat_id, message_count FROM participation WHERE user_id = ?",
    [userId]
  );
  return rows;
}

export async function getUserParticipationMeta(userId: string) {
  const rows = await queryCassandra<{
    chat_id: string;
    first_message_at: Date;
    last_message_at: Date;
  }>(
    "SELECT chat_id, first_message_at, last_message_at FROM participation_meta WHERE user_id = ?",
    [userId]
  );
  return rows;
}

export async function getUserWordStats(userId: string, limit = 20) {
  const rows = await queryCassandra<{
    word: string;
    count: number;
  }>(
    "SELECT word, count FROM user_word_stats WHERE user_id = ? LIMIT ?",
    [userId, limit]
  );
  return rows;
}

export async function getChatInfo(chatId: string) {
  const rows = await queryCassandra<{
    chat_id: string;
    username: string;
    display_name: string;
    bio: string;
    chat_type: string;
    member_count: number;
    avatar_url: string;
    created_at: Date;
  }>(
    "SELECT chat_id, username, display_name, bio, chat_type, member_count, avatar_url, created_at FROM chats WHERE chat_id = ?",
    [chatId]
  );
  return rows[0] || null;
}

export async function getChatWordStats(chatId: string, limit = 20) {
  const rows = await queryCassandra<{
    word: string;
    count: number;
  }>(
    "SELECT word, count FROM chat_word_stats WHERE chat_id = ? LIMIT ?",
    [chatId, limit]
  );
  return rows;
}
