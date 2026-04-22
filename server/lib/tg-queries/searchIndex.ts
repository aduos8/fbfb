import { readEnv } from "./env";

export const SEARCH_INDEXES = {
  profiles: "profiles",
  chats: "chats",
  messages: "messages",
} as const;

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

type MeilisearchTask = {
  taskUid: number;
  status?: string;
  error?: unknown;
};

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
    const task = await request<MeilisearchTask>(`/tasks/${taskUid}`);
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

export async function updateIndexSettings(uid: string, settings: Record<string, unknown>) {
  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function replaceDocuments<T extends Record<string, unknown>>(uid: string, documents: T[]) {
  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents`, {
    method: "PUT",
    body: JSON.stringify(documents),
  });
}

export async function updateDocuments<T extends Record<string, unknown>>(uid: string, documents: T[]) {
  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents`, {
    method: "POST",
    body: JSON.stringify(documents),
  });
}

export async function deleteAllDocuments(uid: string) {
  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents`, {
    method: "DELETE",
  });
}

export async function searchIndex<T extends Record<string, unknown>>(uid: string, payload: SearchRequest) {
  return request<SearchResponse<T>>(`/indexes/${encodeURIComponent(uid)}/search`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function configureSearchIndices() {
  const profileIndexTask = await ensureIndex(SEARCH_INDEXES.profiles, "userId");
  if (profileIndexTask?.taskUid) {
    await waitForTask(profileIndexTask.taskUid);
  }

  const profileSettingsTask = await updateIndexSettings(SEARCH_INDEXES.profiles, {
    searchableAttributes: ["username", "displayName", "bio"],
    filterableAttributes: ["userId", "phoneHash"],
    sortableAttributes: ["updatedAt", "createdAt"],
    typoTolerance: { enabled: true },
    pagination: { maxTotalHits: 500000 },
  });
  await waitForTask(profileSettingsTask.taskUid);

  const chatIndexTask = await ensureIndex(SEARCH_INDEXES.chats, "chatId");
  if (chatIndexTask?.taskUid) {
    await waitForTask(chatIndexTask.taskUid);
  }

  const chatSettingsTask = await updateIndexSettings(SEARCH_INDEXES.chats, {
    searchableAttributes: ["username", "title", "description"],
    filterableAttributes: ["chatId", "chatType"],
    sortableAttributes: ["memberCount", "participantCount", "updatedAt"],
    typoTolerance: { enabled: true },
    pagination: { maxTotalHits: 100000 },
  });
  await waitForTask(chatSettingsTask.taskUid);

  const messageIndexTask = await ensureIndex(SEARCH_INDEXES.messages, "documentId");
  if (messageIndexTask?.taskUid) {
    await waitForTask(messageIndexTask.taskUid);
  }

  const messageSettingsTask = await updateIndexSettings(SEARCH_INDEXES.messages, {
    searchableAttributes: ["content", "senderUsername", "senderDisplayName", "chatTitle"],
    filterableAttributes: ["chatId", "senderId", "senderUsername", "hasMedia", "containsLinks", "contentLength", "timestampMs"],
    sortableAttributes: ["timestampMs"],
    typoTolerance: { enabled: true },
    pagination: { maxTotalHits: 1000000 },
  });
  await waitForTask(messageSettingsTask.taskUid);
}
