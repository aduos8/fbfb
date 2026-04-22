import { readEnv } from "./env";

export const SEARCH_INDEXES = {
  profiles: "profiles",
  chats: "chats",
  messages: "messages",
} as const;

export const MESSAGE_SEARCHABLE_ATTRIBUTES = [
  "content",
  "senderUsername",
  "senderDisplayName",
  "chatTitle",
  "chatUsername",
] as const;

export type SearchIndexMap = {
  profiles: string;
  chats: string;
  messages: string;
};

type SearchRequest = {
  q: string;
  filter?: string | string[];
  offset?: number;
  limit?: number;
  attributesToHighlight?: string[];
  attributesToCrop?: string[];
  cropLength?: number;
  showRankingScore?: boolean;
  sort?: string[];
};

type SearchHit<T> = T & {
  _formatted?: Record<string, string>;
  _rankingScore?: number;
};

type SearchResponse<T> = {
  hits: SearchHit<T>[];
  estimatedTotalHits?: number;
  totalHits?: number;
  offset?: number;
  limit?: number;
  processingTimeMs?: number;
  query?: string;
};

export type MeilisearchTask = {
  taskUid: number;
  batchUid?: number | null;
  indexUid?: string | null;
  status?: string;
  type?: string;
  error?: unknown;
  details?: Record<string, unknown>;
  customMetadata?: string | null;
};

export type MeilisearchBatch = {
  uid: number;
  progressTrace?: Record<string, string>;
  details?: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  duration?: string | null;
};

type DocumentWriteOptions = {
  customMetadata?: string;
};

function withSearchParams(path: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function getConfig() {
  const env = readEnv();
  if (!env.MEILISEARCH_URL || !env.MEILISEARCH_API_KEY) {
    throw new Error("Meilisearch is not configured. Set MEILISEARCH_URL and MEILISEARCH_API_KEY.");
  }

  return {
    url: env.MEILISEARCH_URL.replace(/\/$/, ""),
    apiKey: env.MEILISEARCH_API_KEY,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getConfig();
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meilisearch request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function healthCheckMeilisearch() {
  return request<{ status: string }>("/health");
}

export async function waitForTask(taskUid: number, timeoutMs = 600_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const task = await getTask(taskUid);
    if (task.status === "succeeded") {
      return task;
    }
    if (task.status === "failed") {
      throw new Error(`Meilisearch task ${taskUid} failed: ${JSON.stringify(task.error ?? {})}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Meilisearch task ${taskUid}`);
}

export async function getTask(taskUid: number) {
  return request<MeilisearchTask>(`/tasks/${taskUid}`);
}

export async function getBatch(batchUid: number) {
  return request<MeilisearchBatch>(`/batches/${batchUid}`);
}

export async function ensureIndex(uid: string, primaryKey?: string) {
  try {
    await request(`/indexes/${encodeURIComponent(uid)}`);
    return null;
  } catch {
    return request<MeilisearchTask>("/indexes", {
      method: "POST",
      body: JSON.stringify({ uid, primaryKey }),
    });
  }
}

export async function deleteIndex(uid: string) {
  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}`, {
    method: "DELETE",
  });
}

export async function updateIndexSettings(uid: string, settings: Record<string, unknown>) {
  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function replaceDocuments<T extends Record<string, unknown>>(uid: string, documents: T[], options?: DocumentWriteOptions) {
  return request<MeilisearchTask>(withSearchParams(`/indexes/${encodeURIComponent(uid)}/documents`, {
    customMetadata: options?.customMetadata,
  }), {
    method: "PUT",
    body: JSON.stringify(documents),
  });
}

export async function updateDocuments<T extends Record<string, unknown>>(uid: string, documents: T[], options?: DocumentWriteOptions) {
  return request<MeilisearchTask>(withSearchParams(`/indexes/${encodeURIComponent(uid)}/documents`, {
    customMetadata: options?.customMetadata,
  }), {
    method: "POST",
    body: JSON.stringify(documents),
  });
}

export async function deleteAllDocuments(uid: string, options?: DocumentWriteOptions) {
  return request<MeilisearchTask>(withSearchParams(`/indexes/${encodeURIComponent(uid)}/documents`, {
    customMetadata: options?.customMetadata,
  }), {
    method: "DELETE",
  });
}

export async function deleteDocuments(uid: string, documentIds: string[], options?: DocumentWriteOptions) {
  return request<MeilisearchTask>(withSearchParams(`/indexes/${encodeURIComponent(uid)}/documents/delete-batch`, {
    customMetadata: options?.customMetadata,
  }), {
    method: "POST",
    body: JSON.stringify(documentIds),
  });
}

export async function getIndexStats(uid: string) {
  return request<{ numberOfDocuments?: number }>(`/indexes/${encodeURIComponent(uid)}/stats`);
}

export async function swapIndexes(swaps: Array<{ indexes: [string, string] }>) {
  return request<MeilisearchTask>("/swap-indexes", {
    method: "POST",
    body: JSON.stringify(swaps),
  });
}

export async function searchIndex<T extends Record<string, unknown>>(uid: string, payload: SearchRequest) {
  return request<SearchResponse<T>>(`/indexes/${encodeURIComponent(uid)}/search`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function configureSearchIndices(indexes: SearchIndexMap = SEARCH_INDEXES) {
  const profileIndexTask = await ensureIndex(indexes.profiles, "userId");
  if (profileIndexTask?.taskUid) {
    await waitForTask(profileIndexTask.taskUid);
  }

  const profileSettingsTask = await updateIndexSettings(indexes.profiles, {
    searchableAttributes: ["username", "displayName", "bio"],
    filterableAttributes: ["userId", "phoneHash"],
    sortableAttributes: ["updatedAt", "createdAt"],
    typoTolerance: { enabled: true },
    pagination: { maxTotalHits: 500000 },
  });
  await waitForTask(profileSettingsTask.taskUid);

  const chatIndexTask = await ensureIndex(indexes.chats, "chatId");
  if (chatIndexTask?.taskUid) {
    await waitForTask(chatIndexTask.taskUid);
  }

  const chatSettingsTask = await updateIndexSettings(indexes.chats, {
    searchableAttributes: ["username", "title", "description"],
    filterableAttributes: ["chatId", "chatType"],
    sortableAttributes: ["memberCount", "participantCount", "updatedAt"],
    typoTolerance: { enabled: true },
    pagination: { maxTotalHits: 100000 },
  });
  await waitForTask(chatSettingsTask.taskUid);

  const messageIndexTask = await ensureIndex(indexes.messages, "documentId");
  if (messageIndexTask?.taskUid) {
    await waitForTask(messageIndexTask.taskUid);
  }

  const messageSettingsTask = await updateIndexSettings(indexes.messages, {
    searchableAttributes: [...MESSAGE_SEARCHABLE_ATTRIBUTES],
    filterableAttributes: ["chatId", "senderId", "senderUsername", "hasMedia", "containsLinks", "contentLength", "timestampMs"],
    sortableAttributes: ["timestampMs"],
    typoTolerance: { enabled: true },
    pagination: { maxTotalHits: 5000000 },
  });
  await waitForTask(messageSettingsTask.taskUid);
}
