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

function parseMessageDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatMessageBucket(value: Date | string | null | undefined) {
  const parsed = parseMessageDate(value);
  if (!parsed) {
    return null;
  }

  return `${parsed.getUTCFullYear()}${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

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
  const allRows: unknown[] = [];
  let pageState: Buffer | null = null;
  let pageNum = 0;

  do {
    const result = await client.execute("SELECT * FROM users", [], {
      fetchSize: 10000,
      pageState: pageState as any,
    });
    allRows.push(...result.rows);
    pageState = (result as any).pageState ?? null;
    pageNum++;
    if (pageNum % 10 === 0) {
      console.log(`[listAllUsers] fetched ${allRows.length} rows (${pageNum} pages)...`);
    }
  } while (pageState);

  console.log(`[listAllUsers] total: ${allRows.length} rows`);
  return allRows as unknown as UserRecord[];
}

export async function* streamAllUsers(fetchSize = 5000): AsyncGenerator<UserRecord[]> {
  const client = getClient();
  let pageState: Buffer | null = null;

  do {
    const result = await client.execute("SELECT * FROM users", [], {
      fetchSize,
      pageState: pageState as any,
    });
    yield result.rows as unknown as UserRecord[];
    pageState = (result as any).pageState ?? null;
  } while (pageState);
}

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
  const allRows: unknown[] = [];
  let pageState: Buffer | null = null;
  let pageNum = 0;

  do {
    const result = await client.execute("SELECT * FROM chats", [], {
      fetchSize: 10000,
      pageState: pageState as any,
    });
    allRows.push(...result.rows);
    pageState = (result as any).pageState ?? null;
    pageNum++;
    if (pageNum % 10 === 0) {
      console.log(`[listAllChats] fetched ${allRows.length} rows (${pageNum} pages)...`);
    }
  } while (pageState);

  console.log(`[listAllChats] total: ${allRows.length} rows`);
  return allRows as unknown as ChatRecord[];
}

export async function* streamAllChats(fetchSize = 5000): AsyncGenerator<ChatRecord[]> {
  const client = getClient();
  let pageState: Buffer | null = null;

  do {
    const result = await client.execute("SELECT * FROM chats", [], {
      fetchSize,
      pageState: pageState as any,
    });
    yield result.rows as unknown as ChatRecord[];
    pageState = (result as any).pageState ?? null;
  } while (pageState);
}

export async function getMessageById(chatId: number | string, messageId: number | string): Promise<MessageRecord | null> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_id WHERE chat_id = ? AND message_id = ?",
    [String(chatId), String(messageId)],
    { prepare: true }
  );
  return (result.rows[0] as unknown as MessageRecord) ?? null;
}

export async function getMessageByChatBucketTimestamp(
  chatId: number | string,
  bucket: string,
  timestamp: Date | string,
  messageId: number | string
): Promise<MessageRecord | null> {
  const client = getClient();
  const parsedTimestamp = parseMessageDate(timestamp);
  if (!parsedTimestamp) {
    return null;
  }

  const result = await client.execute(
    "SELECT * FROM messages_by_chat WHERE chat_id = ? AND bucket = ? AND timestamp = ? AND message_id = ? LIMIT 1",
    [String(chatId), bucket, parsedTimestamp, String(messageId)],
    { prepare: true }
  );
  return (result.rows[0] as unknown as MessageRecord) ?? null;
}

export async function listMessagesByChatBucket(chatId: number | string, bucket: string, limit = 100): Promise<MessageRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_chat WHERE chat_id = ? AND bucket = ? ORDER BY timestamp DESC LIMIT ?",
    [String(chatId), bucket, limit],
    { prepare: true }
  );
  return result.rows as unknown as MessageRecord[];
}

export async function listMessagesByChatBucketForUser(
  chatId: number | string,
  bucket: string,
  userId: number | string,
  limit = 100
): Promise<MessageRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_chat WHERE chat_id = ? AND bucket = ? AND user_id = ? ORDER BY timestamp DESC LIMIT ? ALLOW FILTERING",
    [String(chatId), bucket, String(userId), limit],
    { prepare: true }
  );
  return result.rows as unknown as MessageRecord[];
}

export async function listMessagesByUserBucket(userId: number | string, bucket: string, limit = 100): Promise<MessageRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_user WHERE user_id = ? AND bucket = ? ORDER BY timestamp DESC LIMIT ?",
    [String(userId), bucket, limit],
    { prepare: true }
  );
  return result.rows as unknown as MessageRecord[];
}

export async function listMessagesByIdForUser(userId: number | string, limit = 100): Promise<MessageRecord[]> {
  const client = getClient();
  const result = await client.execute(
    "SELECT * FROM messages_by_id WHERE user_id = ? LIMIT ? ALLOW FILTERING",
    [String(userId), limit],
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
  const allRows: unknown[] = [];
  let pageState: Buffer | null = null;
  let pageNum = 0;

  do {
    const result = await client.execute("SELECT * FROM messages_by_id", [], {
      fetchSize: 10000,
      pageState: pageState as any,
    });
    allRows.push(...result.rows);
    pageState = (result as any).pageState ?? null;
    pageNum++;
    if (pageNum % 10 === 0) {
      console.log(`[listAllMessages] fetched ${allRows.length} rows (${pageNum} pages)...`);
    }
  } while (pageState);

  console.log(`[listAllMessages] total: ${allRows.length} rows`);
  return allRows as unknown as MessageRecord[];
}

export async function* streamAllMessages(fetchSize = 5000): AsyncGenerator<MessageRecord[]> {
  const client = getClient();
  let pageState: Buffer | null = null;

  do {
    const result = await client.execute("SELECT * FROM messages_by_id", [], {
      fetchSize,
      pageState: pageState as any,
    });
    yield result.rows as unknown as MessageRecord[];
    pageState = (result as any).pageState ?? null;
  } while (pageState);
}

async function* streamWholeMessageTable(
  label: string,
  query: string,
  fetchSize = 5000
): AsyncGenerator<MessageRecord[]> {
  const client = getClient();
  let pageCount = 0;
  let rowCount = 0;
  let page: MessageRecord[] = [];
  const rowStream = client.stream(query, [], {
    prepare: true,
    fetchSize,
  }) as unknown as AsyncIterable<unknown>;

  for await (const row of rowStream) {
    page.push(row as MessageRecord);
    rowCount += 1;

    if (page.length >= fetchSize) {
      pageCount += 1;
      yield page;
      if (pageCount % 10 === 0) {
        console.log(`[${label}] fetched ${rowCount} rows across ${pageCount} pages...`);
      }
      page = [];
    }
  }

  if (page.length > 0) {
    pageCount += 1;
    yield page;
  }

  console.log(`[${label}] done: ${rowCount} total rows`);
}

export async function* streamAllMessagesFromChatTable(fetchSize = 5000): AsyncGenerator<MessageRecord[]> {
  yield* streamWholeMessageTable(
    "streamAllMessagesFromChatTable",
    "SELECT bucket, chat_id, message_id, user_id, content, has_media, timestamp FROM messages_by_chat",
    fetchSize
  );
}

export async function* streamAllMessagesFromUserTable(fetchSize = 5000): AsyncGenerator<MessageRecord[]> {
  yield* streamWholeMessageTable(
    "streamAllMessagesFromUserTable",
    "SELECT bucket, chat_id, message_id, user_id, content, has_media, timestamp FROM messages_by_user",
    fetchSize
  );
}

type PartitionStreamOptions = {
  fetchSize?: number;
  concurrency?: number;
  maxBufferedPages?: number;
  bucketStartYear?: number;
  bucketStartMonth?: number;
};

type QueueWaiter<T> = {
  resolve: (value: IteratorResult<T>) => void;
  reject: (reason?: unknown) => void;
};

function normalizePartitionStreamOptions(fetchSizeOrOptions: number | PartitionStreamOptions | undefined) {
  if (typeof fetchSizeOrOptions === "number") {
    return {
      fetchSize: fetchSizeOrOptions,
      concurrency: 1,
      maxBufferedPages: 8,
      bucketStartYear: 2013,
      bucketStartMonth: 1,
    };
  }

  const fetchSize = fetchSizeOrOptions?.fetchSize ?? 5000;
  const concurrency = Math.max(1, fetchSizeOrOptions?.concurrency ?? 1);
  const maxBufferedPages = Math.max(1, fetchSizeOrOptions?.maxBufferedPages ?? concurrency * 4);
  const bucketStartYear = Math.max(2013, fetchSizeOrOptions?.bucketStartYear ?? 2013);
  const bucketStartMonth = Math.min(12, Math.max(1, fetchSizeOrOptions?.bucketStartMonth ?? 1));

  return {
    fetchSize,
    concurrency,
    maxBufferedPages,
    bucketStartYear,
    bucketStartMonth,
  };
}

function createAsyncQueue<T>(maxBufferedItems: number) {
  const values: T[] = [];
  const waiters: QueueWaiter<T>[] = [];
  const capacityWaiters: Array<() => void> = [];
  let closed = false;
  let failure: unknown = null;

  function releaseCapacity() {
    while (capacityWaiters.length > 0 && values.length < maxBufferedItems) {
      const resolve = capacityWaiters.shift();
      resolve?.();
    }
  }

  return {
    async push(value: T) {
      while (!closed && !failure && values.length >= maxBufferedItems && waiters.length === 0) {
        await new Promise<void>((resolve) => capacityWaiters.push(resolve));
      }

      if (failure) {
        throw failure;
      }
      if (closed) {
        return;
      }

      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve({ value, done: false });
        return;
      }

      values.push(value);
    },
    close() {
      closed = true;
      releaseCapacity();
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter?.resolve({ value: undefined as T, done: true });
      }
    },
    fail(error: unknown) {
      failure = error;
      releaseCapacity();
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter?.reject(error);
      }
    },
    async next() {
      if (failure) {
        throw failure;
      }

      if (values.length > 0) {
        const value = values.shift()!;
        releaseCapacity();
        return { value, done: false } as IteratorResult<T>;
      }

      if (closed) {
        return { value: undefined as T, done: true } as IteratorResult<T>;
      }

      return new Promise<IteratorResult<T>>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
  };
}

/**
 * Generate all monthly bucket keys from a start date to now.
 * Bucket format: YYYYMM (e.g. "202401")
 */
function generateBuckets(startYear = 2013, startMonth = 1): string[] {
  const buckets: string[] = [];
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth() + 1;

  for (let year = startYear; year <= endYear; year++) {
    const monthStart = year === startYear ? startMonth : 1;
    const monthEnd = year === endYear ? endMonth : 12;
    for (let month = monthStart; month <= monthEnd; month++) {
      buckets.push(`${year}${String(month).padStart(2, "0")}`);
    }
  }

  return buckets;
}

type PartitionStreamDefinition = {
  label: string;
  entityLabel: string;
  progressEvery: number;
  query: string;
  buildParams: (entityId: string, bucket: string) => unknown[];
};

async function* streamPartitionedMessages(
  entityIds: string[],
  fetchSizeOrOptions: number | PartitionStreamOptions,
  definition: PartitionStreamDefinition
): AsyncGenerator<MessageRecord[]> {
  const client = getClient();
  const options = normalizePartitionStreamOptions(fetchSizeOrOptions);
  if (entityIds.length === 0) {
    console.log(`[${definition.label}] no ${definition.entityLabel} to scan`);
    return;
  }

  const buckets = generateBuckets(options.bucketStartYear, options.bucketStartMonth);
  const queue = createAsyncQueue<MessageRecord[]>(options.maxBufferedPages);
  const totalPartitions = entityIds.length * buckets.length;
  const workerCount = Math.min(options.concurrency, totalPartitions);
  const progressEveryPartitions = Math.max(1, definition.progressEvery * buckets.length);
  let nextPartitionIndex = 0;
  let processedPartitions = 0;
  let totalYielded = 0;
  let settledWorkers = 0;

  console.log(
    `[${definition.label}] scanning ${entityIds.length} ${definition.entityLabel} × ${buckets.length} buckets ` +
    `(concurrency=${workerCount})...`
  );

  const workers = Array.from({ length: workerCount }, async () => {
    try {
      while (true) {
        const partitionIndex = nextPartitionIndex++;
        if (partitionIndex >= totalPartitions) {
          return;
        }

        const entityIndex = partitionIndex % entityIds.length;
        const bucketIndex = Math.floor(partitionIndex / entityIds.length);
        const entityId = entityIds[entityIndex]!;
        const bucket = buckets[bucketIndex]!;
        let pageState: Buffer | null = null;

        do {
          const result = await client.execute(
            definition.query,
            definition.buildParams(entityId, bucket),
            {
              prepare: true,
              fetchSize: options.fetchSize,
              pageState: pageState as any,
            }
          );

          const rows = result.rows as unknown as MessageRecord[];
          if (rows.length > 0) {
            await queue.push(rows);
          }

          pageState = (result as any).pageState ?? null;
        } while (pageState);

        processedPartitions += 1;
        if (
          processedPartitions % progressEveryPartitions === 0
          || processedPartitions === totalPartitions
        ) {
          console.log(
            `[${definition.label}] processed ${processedPartitions}/${totalPartitions} partitions ` +
            `(${totalYielded} messages yielded so far)...`
          );
        }
      }
    } catch (error) {
      queue.fail(error);
      throw error;
    } finally {
      settledWorkers += 1;
      if (settledWorkers === workerCount) {
        queue.close();
      }
    }
  });

  try {
    while (true) {
      const next = await queue.next();
      if (next.done) {
        break;
      }

      totalYielded += next.value.length;
      yield next.value;
    }

    await Promise.all(workers);
  } finally {
    await Promise.allSettled(workers);
  }

  console.log(
    `[${definition.label}] done: ${totalYielded} total messages from ${entityIds.length} ${definition.entityLabel}`
  );
}

/**
 * Stream ALL messages from messages_by_chat table.
 * This table is the complete message store (3M+ rows), unlike messages_by_id (~62k).
 * It is partitioned by (chat_id, bucket), so we must iterate over each chat and bucket.
 */
export async function* streamAllMessagesFromChats(
  chatIds: string[],
  fetchSizeOrOptions: number | PartitionStreamOptions = 5000
): AsyncGenerator<MessageRecord[]> {
  yield* streamPartitionedMessages(chatIds, fetchSizeOrOptions, {
    label: "streamAllMessagesFromChats",
    entityLabel: "chats",
    progressEvery: 100,
    query: "SELECT bucket, chat_id, message_id, user_id, content, has_media, timestamp FROM messages_by_chat WHERE chat_id = ? AND bucket = ?",
    buildParams: (chatId, bucket) => [chatId, bucket],
  });
}

/**
 * Stream ALL messages from messages_by_user table.
 * Partitioned by (user_id, bucket), so we iterate over each user and bucket.
 */
export async function* streamAllMessagesFromUsers(
  userIds: string[],
  fetchSizeOrOptions: number | PartitionStreamOptions = 5000
): AsyncGenerator<MessageRecord[]> {
  yield* streamPartitionedMessages(userIds, fetchSizeOrOptions, {
    label: "streamAllMessagesFromUsers",
    entityLabel: "users",
    progressEvery: 500,
    query: "SELECT bucket, chat_id, message_id, user_id, content, has_media, timestamp FROM messages_by_user WHERE user_id = ? AND bucket = ?",
    buildParams: (userId, bucket) => [userId, bucket],
  });
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
