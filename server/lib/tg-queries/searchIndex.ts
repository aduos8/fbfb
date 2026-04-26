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

export type SearchBackend = "meilisearch" | "opensearch";

export type SearchIndexMap = {
  profiles: string;
  chats: string;
  messages: string;
};

export type SearchFilterValue = string | number | boolean;

export type SearchFilterClause =
  | {
      field: string;
      operator: "eq" | "gte" | "lte";
      value: SearchFilterValue;
    }
  | {
      field: string;
      operator: "in";
      values: SearchFilterValue[];
    };

export type SearchRequest = {
  q: string;
  filters?: SearchFilterClause[];
  offset?: number;
  limit?: number;
  page?: number;
  hitsPerPage?: number;
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
  page?: number;
  hitsPerPage?: number;
  totalPages?: number;
  processingTimeMs?: number;
  query?: string;
};

export type SearchTask = {
  taskUid: number;
  batchUid?: number | null;
  indexUid?: string | null;
  status?: string;
  type?: string;
  error?: unknown;
  details?: Record<string, unknown>;
  customMetadata?: string | null;
  backend?: SearchBackend;
};

export type SearchBatch = {
  uid: number;
  progressTrace?: Record<string, string>;
  details?: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  duration?: string | null;
  backend?: SearchBackend;
};

export type MeilisearchTask = SearchTask;
export type MeilisearchBatch = SearchBatch;

type OpenSearchAliasSwapDetail = {
  liveAlias: string;
  shadowAlias: string;
  previousLiveTargets: string[];
  promotedTargets: string[];
};

type DocumentWriteOptions = {
  customMetadata?: string;
  refresh?: boolean | "wait_for";
};

type SearchConfig =
  | {
      backend: "meilisearch";
      url: string;
      apiKey: string;
    }
  | {
      backend: "opensearch";
      url: string;
      username?: string;
      password?: string;
    };

type OpenSearchIndexDefinition = {
  primaryKey: string;
  searchableAttributes: readonly string[];
  settings: Record<string, unknown>;
  mappings: {
    properties: Record<string, unknown>;
  };
};

type IndexDefinition = {
  primaryKey: string;
  searchableAttributes: readonly string[];
  meilisearchSettings: Record<string, unknown>;
  opensearch: OpenSearchIndexDefinition;
};

type OpenSearchHealthResponse = {
  status?: string;
  cluster_name?: string;
};

type OpenSearchSearchResponse<T> = {
  took?: number;
  hits?: {
    total?: number | { value?: number };
    hits?: Array<{
      _id?: string;
      _score?: number | null;
      _source?: T;
      highlight?: Record<string, string[]>;
    }>;
  };
};

const SYNTHETIC_TASK_UID = -1;
const SYNTHETIC_BATCH_UID = -1;
const OPENSEARCH_KEYWORD_SUBFIELDS = new Set([
  "username",
  "displayName",
  "senderUsername",
  "senderDisplayName",
  "chatTitle",
  "chatUsername",
  "title",
]);
const OPENSEARCH_CREATE_ONLY_INDEX_SETTINGS = new Set([
  "number_of_shards",
]);

const INDEX_DEFINITIONS: Record<keyof SearchIndexMap, IndexDefinition> = {
  profiles: {
    primaryKey: "userId",
    searchableAttributes: ["username", "displayName", "bio"],
    meilisearchSettings: {
      searchableAttributes: ["username", "displayName", "bio"],
      filterableAttributes: ["userId", "phoneHash"],
      sortableAttributes: ["updatedAt", "createdAt"],
      typoTolerance: { enabled: true },
      pagination: { maxTotalHits: 500000 },
    },
    opensearch: {
      primaryKey: "userId",
      searchableAttributes: ["username", "displayName", "bio"],
      settings: {
        index: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      },
      mappings: {
        properties: {
          userId: { type: "keyword" },
          username: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          displayName: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          bio: { type: "text" },
          profilePhoto: { type: "keyword" },
          phoneHash: { type: "keyword" },
          phoneMasked: { type: "keyword" },
          createdAt: { type: "date" },
          updatedAt: { type: "date" },
          isTelegramPremium: { type: "boolean" },
        },
      },
    },
  },
  chats: {
    primaryKey: "chatId",
    searchableAttributes: ["username", "title", "description"],
    meilisearchSettings: {
      searchableAttributes: ["username", "title", "description"],
      filterableAttributes: ["chatId", "chatType"],
      sortableAttributes: ["memberCount", "participantCount", "updatedAt"],
      typoTolerance: { enabled: true },
      pagination: { maxTotalHits: 100000 },
    },
    opensearch: {
      primaryKey: "chatId",
      searchableAttributes: ["username", "title", "description"],
      settings: {
        index: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      },
      mappings: {
        properties: {
          chatId: { type: "keyword" },
          chatType: { type: "keyword" },
          username: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          title: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          description: { type: "text" },
          memberCount: { type: "long" },
          participantCount: { type: "long" },
          profilePhoto: { type: "keyword" },
          createdAt: { type: "date" },
          updatedAt: { type: "date" },
        },
      },
    },
  },
  messages: {
    primaryKey: "documentId",
    searchableAttributes: [...MESSAGE_SEARCHABLE_ATTRIBUTES],
    meilisearchSettings: {
      searchableAttributes: [...MESSAGE_SEARCHABLE_ATTRIBUTES],
      filterableAttributes: [
        "chatId",
        "senderId",
        "senderUsername",
        "hasMedia",
        "containsLinks",
        "contentLength",
        "timestampMs",
        "contentCharacterSet",
      ],
      sortableAttributes: ["timestampMs"],
      typoTolerance: { enabled: false },
      pagination: { maxTotalHits: 900000000 },
    },
    opensearch: {
      primaryKey: "documentId",
      searchableAttributes: [...MESSAGE_SEARCHABLE_ATTRIBUTES],
      settings: {
        index: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      },
      mappings: {
        properties: {
          documentId: { type: "keyword" },
          messageId: { type: "keyword" },
          chatId: { type: "keyword" },
          senderId: { type: "keyword" },
          senderUsername: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          senderDisplayName: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          chatTitle: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          chatType: { type: "keyword" },
          chatUsername: {
            type: "text",
            fields: {
              keyword: { type: "keyword", ignore_above: 256 },
            },
          },
          content: { type: "text" },
          contentCharacterSet: { type: "keyword" },
          hasMedia: { type: "boolean" },
          containsLinks: { type: "boolean" },
          contentLength: { type: "long" },
          bucket: { type: "keyword" },
          timestamp: { type: "date" },
          timestampMs: { type: "long" },
        },
      },
    },
  },
};

function parseIndexRole(uid: string): keyof SearchIndexMap {
  if (uid.startsWith(SEARCH_INDEXES.profiles)) {
    return "profiles";
  }
  if (uid.startsWith(SEARCH_INDEXES.chats)) {
    return "chats";
  }
  if (uid.startsWith(SEARCH_INDEXES.messages)) {
    return "messages";
  }

  throw new Error(`Unknown search index role for "${uid}"`);
}

function getIndexDefinition(uid: string) {
  return INDEX_DEFINITIONS[parseIndexRole(uid)];
}

function withSearchParams(path: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function getConfig(): SearchConfig {
  const env = readEnv();
  const backend = env.SEARCH_BACKEND.trim().toLowerCase() as SearchBackend;

  if (backend === "meilisearch") {
    if (!env.MEILISEARCH_URL || !env.MEILISEARCH_API_KEY) {
      throw new Error(
        "Meilisearch is not configured. Set SEARCH_BACKEND=meilisearch plus MEILISEARCH_URL and MEILISEARCH_API_KEY."
      );
    }

    return {
      backend,
      url: env.MEILISEARCH_URL.replace(/\/$/, ""),
      apiKey: env.MEILISEARCH_API_KEY,
    };
  }

  if (!env.OPENSEARCH_URL) {
    throw new Error(
      "OpenSearch is not configured. Set SEARCH_BACKEND=opensearch plus OPENSEARCH_URL."
    );
  }

  return {
    backend: "opensearch",
    url: env.OPENSEARCH_URL.replace(/\/$/, ""),
    username: env.OPENSEARCH_USERNAME || undefined,
    password: env.OPENSEARCH_PASSWORD || undefined,
  };
}

export function getSearchBackend(): SearchBackend {
  const env = readEnv();
  return env.SEARCH_BACKEND.trim().toLowerCase() === "meilisearch"
    ? "meilisearch"
    : "opensearch";
}

export function isTrackedSearchTaskId(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function getOpenSearchSwapDetails(task: SearchTask | null | undefined): OpenSearchAliasSwapDetail[] {
  const swaps = task?.details?.swaps;
  if (!Array.isArray(swaps)) {
    return [];
  }

  return swaps.filter((swap): swap is OpenSearchAliasSwapDetail => {
    if (!swap || typeof swap !== "object") {
      return false;
    }

    const candidate = swap as Record<string, unknown>;
    return typeof candidate.liveAlias === "string"
      && typeof candidate.shadowAlias === "string"
      && Array.isArray(candidate.previousLiveTargets)
      && Array.isArray(candidate.promotedTargets);
  });
}

async function parseErrorBody(response: Response) {
  const body = await response.text();
  return body || response.statusText || "Unknown error";
}

function shouldLogOpenSearchSearch(path: string, init?: RequestInit) {
  return getSearchBackend() === "opensearch"
    && (init?.method ?? "GET").toUpperCase() === "POST"
    && path.includes("/_search");
}

function logOpenSearchSearch(path: string, init: RequestInit | undefined, phase: "request" | "response" | "error", payload: unknown) {
  const prefix = `[opensearch:search:${phase}]`;
  if (phase === "request") {
    console.log(prefix, JSON.stringify({
      path,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ?? null,
    }));
    return;
  }

  console.log(prefix, JSON.stringify({
    path,
    method: init?.method ?? "GET",
    payload,
  }));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getConfig();
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (config.backend === "meilisearch") {
    headers.set("Authorization", `Bearer ${config.apiKey}`);
  } else if (config.username || config.password) {
    const credentials = Buffer.from(
      `${config.username ?? ""}:${config.password ?? ""}`,
      "utf8"
    ).toString("base64");
    headers.set("Authorization", `Basic ${credentials}`);
  }

  const shouldLogSearch = shouldLogOpenSearchSearch(path, init);
  if (shouldLogSearch) {
    logOpenSearchSearch(path, init, "request", null);
  }

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await parseErrorBody(response);
    if (shouldLogSearch) {
      logOpenSearchSearch(path, init, "error", {
        status: response.status,
        body,
      });
    }
    const provider = config.backend === "meilisearch" ? "Meilisearch" : "OpenSearch";
    throw new Error(`${provider} request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : undefined as T;
  if (shouldLogSearch) {
    logOpenSearchSearch(path, init, "response", {
      status: response.status,
      body: payload,
    });
  }
  return payload;
}

async function rawRequest(path: string, init?: RequestInit) {
  const config = getConfig();
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (config.backend === "meilisearch") {
    headers.set("Authorization", `Bearer ${config.apiKey}`);
  } else if (config.username || config.password) {
    const credentials = Buffer.from(
      `${config.username ?? ""}:${config.password ?? ""}`,
      "utf8"
    ).toString("base64");
    headers.set("Authorization", `Basic ${credentials}`);
  }

  return fetch(`${config.url}${path}`, {
    ...init,
    headers,
  });
}

async function headRequest(path: string) {
  const response = await rawRequest(path, { method: "HEAD" });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Search request failed (${response.status}): ${body}`);
  }
  return true;
}

function createSyntheticTask(
  indexUid: string | null,
  type: string,
  details?: Record<string, unknown>,
  customMetadata?: string
): SearchTask {
  return {
    taskUid: SYNTHETIC_TASK_UID,
    batchUid: SYNTHETIC_BATCH_UID,
    indexUid,
    status: "succeeded",
    type,
    details,
    customMetadata: customMetadata ?? null,
    backend: "opensearch",
  };
}

function createSyntheticBatch(uid = SYNTHETIC_BATCH_UID, details?: Record<string, unknown>): SearchBatch {
  return {
    uid,
    details: details ?? {},
    progressTrace: {},
    startedAt: null,
    finishedAt: null,
    duration: null,
    backend: "opensearch",
  };
}

async function getOpenSearchAliasTargets(alias: string) {
  const response = await rawRequest(`/_alias/${encodeURIComponent(alias)}`);
  if (response.status === 404) {
    return [] as string[];
  }
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`OpenSearch request failed (${response.status}): ${body}`);
  }

  const payload = await response.json() as Record<string, unknown>;
  return Object.keys(payload);
}

function buildOpenSearchBackingIndexName(alias: string) {
  return `${alias}__backing_v1`;
}

function getMutableOpenSearchIndexSettings(settings: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !OPENSEARCH_CREATE_ONLY_INDEX_SETTINGS.has(key))
  );
}

async function createOpenSearchConcreteIndex(indexName: string, alias: string) {
  const definition = getIndexDefinition(alias).opensearch;
  return request(`/${encodeURIComponent(indexName)}`, {
    method: "PUT",
    body: JSON.stringify({
      settings: definition.settings,
      mappings: definition.mappings,
      aliases: {
        [alias]: {
          is_write_index: true,
        },
      },
    }),
  });
}

async function ensureOpenSearchAliasIndex(alias: string) {
  const targets = await getOpenSearchAliasTargets(alias);
  if (targets.length > 0) {
    return createSyntheticTask(alias, "configure-index", {
      alias,
      targets,
      created: false,
    });
  }

  const backingIndexName = buildOpenSearchBackingIndexName(alias);
  const backingExists = await headRequest(`/${encodeURIComponent(backingIndexName)}`);
  if (!backingExists) {
    await createOpenSearchConcreteIndex(backingIndexName, alias);
  } else {
    await request("/_aliases", {
      method: "POST",
      body: JSON.stringify({
        actions: [
          {
            add: {
              index: backingIndexName,
              alias,
              is_write_index: true,
            },
          },
        ],
      }),
    });
  }

  return createSyntheticTask(alias, "configure-index", {
    alias,
    target: backingIndexName,
    created: true,
  });
}

async function resolveOpenSearchIndexTargets(uid: string) {
  const aliasTargets = await getOpenSearchAliasTargets(uid);
  if (aliasTargets.length > 0) {
    return aliasTargets;
  }

  if (await headRequest(`/${encodeURIComponent(uid)}`)) {
    return [uid];
  }

  return [] as string[];
}

function toMeilisearchFilterValue(value: SearchFilterValue) {
  return typeof value === "string"
    ? `"${value.replace(/"/g, '\\"')}"`
    : String(value);
}

function toMeilisearchFilterClause(clause: SearchFilterClause) {
  if (clause.operator === "in") {
    return `${clause.field} IN [${clause.values.map(toMeilisearchFilterValue).join(", ")}]`;
  }

  const operator = clause.operator === "eq" ? "=" : clause.operator === "gte" ? ">=" : "<=";
  return `${clause.field} ${operator} ${toMeilisearchFilterValue(clause.value)}`;
}

function normalizeOpenSearchField(field: string, mode: "search" | "filter" | "sort") {
  if (mode === "search") {
    return field;
  }

  if (OPENSEARCH_KEYWORD_SUBFIELDS.has(field)) {
    return `${field}.keyword`;
  }

  return field;
}

function buildOpenSearchFilterClause(clause: SearchFilterClause) {
  if (clause.operator === "eq") {
    return {
      term: {
        [normalizeOpenSearchField(clause.field, "filter")]: clause.value,
      },
    };
  }

  if (clause.operator === "in") {
    return {
      terms: {
        [normalizeOpenSearchField(clause.field, "filter")]: clause.values,
      },
    };
  }

  return {
    range: {
      [normalizeOpenSearchField(clause.field, "filter")]: {
        [clause.operator]: clause.value,
      },
    },
  };
}

function parseSort(sort: string) {
  const [rawField, rawDirection] = sort.split(":", 2);
  return {
    field: rawField,
    order: rawDirection === "asc" ? "asc" : "desc",
  } as const;
}

function buildOpenSearchSort(sort: string[] | undefined) {
  return sort?.map((entry) => {
    const parsed = parseSort(entry);
    return {
      [normalizeOpenSearchField(parsed.field, "sort")]: {
        order: parsed.order,
      },
    };
  });
}

function escapeOpenSearchWildcard(value: string) {
  return value.replace(/[\\*?]/g, "\\$&");
}

function buildOpenSearchMustClause(uid: string, query: string | undefined) {
  const definition = getIndexDefinition(uid).opensearch;
  const cleaned = query?.trim();
  if (!cleaned) {
    return [{ match_all: {} }];
  }

  const role = parseIndexRole(uid);
  if (role !== "messages" && cleaned.length <= 2) {
    const wildcardValue = `*${escapeOpenSearchWildcard(cleaned)}*`;
    return [
      {
        bool: {
          should: definition.searchableAttributes.map((field) => ({
            wildcard: {
              [field]: {
                value: wildcardValue,
                case_insensitive: true,
              },
            },
          })),
          minimum_should_match: 1,
        },
      },
    ];
  }

  return [
    {
      multi_match: {
        query: cleaned,
        fields: definition.searchableAttributes,
        ...(role === "messages" && /\s/.test(cleaned) ? { operator: "and" as const } : {}),
        ...(role === "messages" ? {} : { fuzziness: "AUTO" }),
      },
    },
  ];
}

function buildOpenSearchBody(uid: string, payload: SearchRequest) {
  const size = payload.hitsPerPage ?? payload.limit ?? 20;
  const from = payload.offset ?? (payload.page && payload.page > 0 ? (payload.page - 1) * size : 0);
  const filters = payload.filters?.map(buildOpenSearchFilterClause) ?? [];
  const must = buildOpenSearchMustClause(uid, payload.q);
  const body: Record<string, unknown> = {
    from,
    size,
    track_total_hits: true,
    query: {
      bool: {
        must,
        filter: filters,
      },
    },
  };

  const sort = buildOpenSearchSort(payload.sort);
  if (sort && sort.length > 0) {
    body.sort = sort;
  }

  if (payload.q && payload.attributesToHighlight && payload.attributesToHighlight.length > 0) {
    const fragmentSize = payload.cropLength ?? 180;
    body.highlight = {
      pre_tags: ["<mark>"],
      post_tags: ["</mark>"],
      fields: Object.fromEntries(
        payload.attributesToHighlight.map((attribute) => [
          attribute,
          {
            number_of_fragments: 1,
            fragment_size: fragmentSize,
          },
        ])
      ),
    };
  }

  return body;
}

function normalizeOpenSearchSearchResponse<T extends Record<string, unknown>>(
  payload: OpenSearchSearchResponse<T>,
  requestPayload: SearchRequest
): SearchResponse<T> {
  const hits = payload.hits?.hits ?? [];
  const total =
    typeof payload.hits?.total === "number"
      ? payload.hits.total
      : payload.hits?.total?.value;
  const normalizedHits = hits.map((hit) => {
    const source = hit._source ?? ({} as T);
    const formatted = hit.highlight
      ? Object.fromEntries(
          Object.entries(hit.highlight).map(([field, fragments]) => [field, fragments.join(" … ")])
        )
      : undefined;

    return {
      ...source,
      _formatted: formatted,
      _rankingScore: typeof hit._score === "number" ? hit._score : undefined,
    };
  });
  const hitsPerPage = requestPayload.hitsPerPage ?? requestPayload.limit;
  const page = requestPayload.page ?? (hitsPerPage ? Math.floor((requestPayload.offset ?? 0) / hitsPerPage) + 1 : undefined);

  return {
    hits: normalizedHits,
    estimatedTotalHits: total,
    totalHits: total,
    offset: requestPayload.offset ?? (page && hitsPerPage ? (page - 1) * hitsPerPage : 0),
    limit: requestPayload.limit ?? hitsPerPage,
    page,
    hitsPerPage,
    totalPages: hitsPerPage && total !== undefined ? Math.ceil(total / hitsPerPage) : undefined,
    processingTimeMs: payload.took,
    query: requestPayload.q,
  };
}

function buildBulkOperationBody(
  uid: string,
  documents: Record<string, unknown>[],
  action: "index" | "delete"
) {
  const definition = getIndexDefinition(uid);
  const lines: string[] = [];

  for (const document of documents) {
    const id = action === "delete"
      ? String(document.id)
      : String(document[definition.primaryKey] ?? "");
    if (!id) {
      throw new Error(`OpenSearch document is missing primary key "${definition.primaryKey}"`);
    }

    lines.push(JSON.stringify({ [action]: { _index: uid, _id: id } }));
    if (action === "index") {
      lines.push(JSON.stringify(document));
    }
  }

  return `${lines.join("\n")}\n`;
}

async function runOpenSearchBulkOperation(
  uid: string,
  documents: Record<string, unknown>[],
  action: "index" | "delete",
  options?: DocumentWriteOptions
) {
  if (documents.length === 0) {
    return createSyntheticTask(uid, action, { count: 0 }, options?.customMetadata);
  }

  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Record<string, unknown>;
    try {
      const refresh = options?.refresh === undefined
        ? "wait_for"
        : options.refresh === true
          ? "true"
          : options.refresh === false
            ? undefined
            : options.refresh;
      response = await request<Record<string, unknown>>(withSearchParams(`/${encodeURIComponent(uid)}/_bulk`, {
        refresh,
      }), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-ndjson",
        },
        body: buildBulkOperationBody(uid, documents, action),
      });
    } catch (error) {
      const is429 = error instanceof Error && error.message.includes("(429)");
      if (is429 && attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[indexer] OpenSearch 429 on bulk ${action} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), ` +
          `retrying in ${delayMs}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }

    if (response.errors) {
      const failedItems = Array.isArray(response.items)
        ? response.items.filter((item) =>
            Object.values(item as Record<string, unknown>).some((value) => {
              if (!value || typeof value !== "object") {
                return false;
              }
              return Boolean((value as Record<string, unknown>).error);
            })
          )
        : [];
      throw new Error(`OpenSearch bulk ${action} failed: ${JSON.stringify(failedItems)}`);
    }

    return createSyntheticTask(uid, action, {
      count: documents.length,
      items: Array.isArray(response.items) ? response.items.length : documents.length,
    }, options?.customMetadata);
  }

  throw new Error(`OpenSearch bulk ${action} failed after ${MAX_RETRIES + 1} attempts (persistent 429)`);
}

export async function healthCheckSearchBackend() {
  const config = getConfig();
  if (config.backend === "meilisearch") {
    const result = await request<{ status: string }>("/health");
    return {
      backend: "meilisearch" as const,
      status: result.status,
      healthy: result.status === "available",
    };
  }

  const result = await request<OpenSearchHealthResponse>("/_cluster/health");
  return {
    backend: "opensearch" as const,
    status: result.status ?? "unknown",
    healthy: ["green", "yellow"].includes(result.status ?? ""),
  };
}

export async function healthCheckMeilisearch() {
  const result = await healthCheckSearchBackend();
  if (result.backend !== "meilisearch") {
    throw new Error("healthCheckMeilisearch is only available when SEARCH_BACKEND=meilisearch");
  }
  return { status: result.status };
}

export async function waitForTask(taskUid: number, timeoutMs = 600_000) {
  const config = getConfig();
  if (config.backend === "opensearch" || !isTrackedSearchTaskId(taskUid)) {
    return createSyntheticTask(null, "wait", { timeoutMs });
  }

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
  const config = getConfig();
  if (config.backend === "opensearch" || !isTrackedSearchTaskId(taskUid)) {
    return createSyntheticTask(null, "task");
  }

  return request<MeilisearchTask>(`/tasks/${taskUid}`);
}

export async function refreshIndex(uid: string) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    await request(`/${encodeURIComponent(uid)}/_refresh`, {
      method: "POST",
    });
    return createSyntheticTask(uid, "refresh-index", { refreshed: true });
  }

  return createSyntheticTask(uid, "refresh-index", { refreshed: false });
}

export async function getBatch(batchUid: number) {
  const config = getConfig();
  if (config.backend === "opensearch" || !isTrackedSearchTaskId(batchUid)) {
    return createSyntheticBatch(batchUid);
  }

  return request<MeilisearchBatch>(`/batches/${batchUid}`);
}

export async function ensureIndex(uid: string, primaryKey?: string) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    void primaryKey;
    return ensureOpenSearchAliasIndex(uid);
  }

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
  const config = getConfig();
  if (config.backend === "opensearch") {
    const aliasTargets = await getOpenSearchAliasTargets(uid);
    if (aliasTargets.length > 0) {
      await request(`/${aliasTargets.map(encodeURIComponent).join(",")}`, {
        method: "DELETE",
      });
      return createSyntheticTask(uid, "delete-index", { deletedIndexes: aliasTargets });
    }

    const exists = await headRequest(`/${encodeURIComponent(uid)}`);
    if (exists) {
      await request(`/${encodeURIComponent(uid)}`, {
        method: "DELETE",
      });
    }
    return createSyntheticTask(uid, "delete-index", { deletedIndexes: exists ? [uid] : [] });
  }

  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}`, {
    method: "DELETE",
  });
}

export async function updateIndexSettings(uid: string, settings: Record<string, unknown>) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    await ensureOpenSearchAliasIndex(uid);
    const targets = await resolveOpenSearchIndexTargets(uid);
    const normalizedSettings =
      settings.index && typeof settings.index === "object"
        ? settings.index as Record<string, unknown>
        : settings;
    const mutableSettings = getMutableOpenSearchIndexSettings(normalizedSettings);

    if (targets.length === 0 || Object.keys(mutableSettings).length === 0) {
      return createSyntheticTask(uid, "update-settings", {
        targets,
        applied: false,
      });
    }

    await request(`/${targets.map(encodeURIComponent).join(",")}/_settings`, {
      method: "PUT",
      body: JSON.stringify({
        index: mutableSettings,
      }),
    });

    return createSyntheticTask(uid, "update-settings", {
      targets,
      applied: true,
      settings: mutableSettings,
    });
  }

  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function replaceDocuments<T extends Record<string, unknown>>(
  uid: string,
  documents: T[],
  options?: DocumentWriteOptions
) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    return runOpenSearchBulkOperation(uid, documents, "index", options);
  }

  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents`, {
    method: "PUT",
    body: JSON.stringify(documents),
  });
}

export async function updateDocuments<T extends Record<string, unknown>>(
  uid: string,
  documents: T[],
  options?: DocumentWriteOptions
) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    return runOpenSearchBulkOperation(uid, documents, "index", options);
  }

  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents`, {
    method: "POST",
    body: JSON.stringify(documents),
  });
}

export async function deleteAllDocuments(uid: string, options?: DocumentWriteOptions) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    const deleteTask = await deleteIndex(uid);
    const ensureTask = await ensureIndex(uid);
    return createSyntheticTask(uid, "delete-all-documents", {
      reset: true,
      deleteTask: deleteTask.details ?? null,
      ensureTask: ensureTask?.details ?? null,
    }, options?.customMetadata);
  }

  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents`, {
    method: "DELETE",
  });
}

export async function deleteDocuments(uid: string, documentIds: string[], options?: DocumentWriteOptions) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    const documents = documentIds.map((id) => ({ id }));
    return runOpenSearchBulkOperation(uid, documents, "delete", options);
  }

  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents/delete-batch`, {
    method: "POST",
    body: JSON.stringify(documentIds),
  });
}

export async function deleteDocumentsByFilter(
  uid: string,
  filters: SearchFilterClause[],
  options?: DocumentWriteOptions
) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    await request(`/${encodeURIComponent(uid)}/_delete_by_query?refresh=true`, {
      method: "POST",
      body: JSON.stringify({
        query: {
          bool: {
            filter: filters.map(buildOpenSearchFilterClause),
          },
        },
      }),
    });
    return createSyntheticTask(uid, "delete-by-filter", {
      filterCount: filters.length,
    }, options?.customMetadata);
  }

  return request<MeilisearchTask>(`/indexes/${encodeURIComponent(uid)}/documents/delete`, {
    method: "POST",
    body: JSON.stringify({
      filter: filters.map(toMeilisearchFilterClause),
    }),
  });
}

export async function getIndexStats(uid: string) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    const response = await request<{ count?: number }>(`/${encodeURIComponent(uid)}/_count`);
    return { numberOfDocuments: response.count ?? 0 };
  }

  return request<{ numberOfDocuments?: number }>(`/indexes/${encodeURIComponent(uid)}/stats`);
}

export async function swapIndexes(swaps: Array<{ indexes: [string, string] }>) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    const actions: Array<Record<string, unknown>> = [];
    const details: OpenSearchAliasSwapDetail[] = [];

    for (const swap of swaps) {
      const [liveAlias, shadowAlias] = swap.indexes;
      const [liveTargets, shadowTargets] = await Promise.all([
        getOpenSearchAliasTargets(liveAlias),
        getOpenSearchAliasTargets(shadowAlias),
      ]);
      if (shadowTargets.length === 0) {
        throw new Error(`OpenSearch swap failed: alias "${shadowAlias}" has no backing index`);
      }

      for (const target of liveTargets) {
        actions.push({
          remove: {
            index: target,
            alias: liveAlias,
          },
        });
      }
      for (const target of shadowTargets) {
        actions.push({
          add: {
            index: target,
            alias: liveAlias,
            is_write_index: true,
          },
        });
      }
      for (const target of shadowTargets) {
        actions.push({
          remove: {
            index: target,
            alias: shadowAlias,
          },
        });
      }

      details.push({
        liveAlias,
        shadowAlias,
        previousLiveTargets: liveTargets,
        promotedTargets: shadowTargets,
      });
    }

    await request("/_aliases", {
      method: "POST",
      body: JSON.stringify({ actions }),
    });

    return createSyntheticTask(null, "swap-indexes", { swaps: details });
  }

  return request<MeilisearchTask>("/swap-indexes", {
    method: "POST",
    body: JSON.stringify(swaps),
  });
}

export async function searchIndex<T extends Record<string, unknown>>(uid: string, payload: SearchRequest) {
  const config = getConfig();
  if (config.backend === "opensearch") {
    const response = await request<OpenSearchSearchResponse<T>>(`/${encodeURIComponent(uid)}/_search`, {
      method: "POST",
      body: JSON.stringify(buildOpenSearchBody(uid, payload)),
    });
    return normalizeOpenSearchSearchResponse(response, payload);
  }

  const filter = payload.filters?.map(toMeilisearchFilterClause);
  return request<SearchResponse<T>>(`/indexes/${encodeURIComponent(uid)}/search`, {
    method: "POST",
    body: JSON.stringify({
      q: payload.q,
      filter,
      offset: payload.offset,
      limit: payload.limit,
      page: payload.page,
      hitsPerPage: payload.hitsPerPage,
      attributesToHighlight: payload.attributesToHighlight,
      attributesToCrop: payload.attributesToCrop,
      cropLength: payload.cropLength,
      showRankingScore: payload.showRankingScore,
      sort: payload.sort,
    }),
  });
}

export async function configureSearchIndices(indexes: SearchIndexMap = SEARCH_INDEXES) {
  const config = getConfig();
  const profileIndexTask = await ensureIndex(indexes.profiles, "userId");
  if (isTrackedSearchTaskId(profileIndexTask?.taskUid)) {
    await waitForTask(profileIndexTask.taskUid);
  }

  const profileSettingsTask = await updateIndexSettings(
    indexes.profiles,
    config.backend === "opensearch"
      ? INDEX_DEFINITIONS.profiles.opensearch.settings.index as Record<string, unknown>
      : INDEX_DEFINITIONS.profiles.meilisearchSettings
  );
  if (isTrackedSearchTaskId(profileSettingsTask.taskUid)) {
    await waitForTask(profileSettingsTask.taskUid);
  }

  const chatIndexTask = await ensureIndex(indexes.chats, "chatId");
  if (isTrackedSearchTaskId(chatIndexTask?.taskUid)) {
    await waitForTask(chatIndexTask.taskUid);
  }

  const chatSettingsTask = await updateIndexSettings(
    indexes.chats,
    config.backend === "opensearch"
      ? INDEX_DEFINITIONS.chats.opensearch.settings.index as Record<string, unknown>
      : INDEX_DEFINITIONS.chats.meilisearchSettings
  );
  if (isTrackedSearchTaskId(chatSettingsTask.taskUid)) {
    await waitForTask(chatSettingsTask.taskUid);
  }

  const messageIndexTask = await ensureIndex(indexes.messages, "documentId");
  if (isTrackedSearchTaskId(messageIndexTask?.taskUid)) {
    await waitForTask(messageIndexTask.taskUid);
  }

  const messageSettingsTask = await updateIndexSettings(
    indexes.messages,
    config.backend === "opensearch"
      ? INDEX_DEFINITIONS.messages.opensearch.settings.index as Record<string, unknown>
      : INDEX_DEFINITIONS.messages.meilisearchSettings
  );
  if (isTrackedSearchTaskId(messageSettingsTask.taskUid)) {
    await waitForTask(messageSettingsTask.taskUid);
  }
}
