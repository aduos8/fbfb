export type PublicApiSearchType = "profile" | "channel" | "group" | "message";
export type PublicApiExplorerEndpoint = "search" | "credits";
export type PublicApiAuthMode = "x-api-key" | "bearer";

export type SearchRequestBody = {
  type: PublicApiSearchType;
  q: string;
  filters: Record<string, string | number | boolean>;
  page: number;
  limit: number;
};

export type ExplorerSnippetInput = {
  apiBase: string;
  apiKey: string;
  endpoint: PublicApiExplorerEndpoint;
  authMode: PublicApiAuthMode;
  searchBody: SearchRequestBody;
};

export type DocOverviewCard = {
  label: string;
  value: string;
  detail: string;
};

export type DocsSectionLink = {
  id: string;
  label: string;
};

export type EndpointReference = {
  id: PublicApiExplorerEndpoint;
  method: "POST" | "GET";
  path: string;
  title: string;
  description: string;
  auth: string;
  contentType: string;
  notes: string[];
};

export type RequestField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type FilterRow = {
  field: string;
  aliases: string;
  type: string;
  description: string;
};

export type ErrorReference = {
  status: number;
  code: string;
  description: string;
  trigger: string;
};

const SEARCH_DEFAULTS: Record<PublicApiSearchType, SearchRequestBody> = {
  profile: {
    type: "profile",
    q: "alice",
    filters: {
      display_name: "Alice",
      number: "+15550000000",
    },
    page: 1,
    limit: 25,
  },
  channel: {
    type: "channel",
    q: "security updates",
    filters: {
      username: "updates",
      chat_id: "123456789",
      bio: "announcements",
    },
    page: 1,
    limit: 25,
  },
  group: {
    type: "group",
    q: "community",
    filters: {
      display_name: "Builders Hub",
      bio: "support",
      chat_id: "987654321",
    },
    page: 1,
    limit: 25,
  },
  message: {
    type: "message",
    q: "invoice",
    filters: {
      username: "sender_name",
      chat_id: "123456789",
      containsLinks: true,
    },
    page: 1,
    limit: 25,
  },
};

export function createDefaultSearchRequest(type: PublicApiSearchType): SearchRequestBody {
  return JSON.parse(JSON.stringify(SEARCH_DEFAULTS[type])) as SearchRequestBody;
}

export function normalizeExplorerApiKey(apiKey: string) {
  return apiKey.trim();
}

function buildAuthHeaders(authMode: PublicApiAuthMode, apiKey: string) {
  return authMode === "bearer"
    ? { Authorization: `Bearer ${apiKey}` }
    : { "X-API-Key": apiKey };
}

function jsonStringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function pathForEndpoint(apiBase: string, endpoint: PublicApiExplorerEndpoint) {
  return endpoint === "search"
    ? `${apiBase}/api/v1/search`
    : `${apiBase}/api/v1/credits`;
}

export function buildExplorerCurlSnippet(input: ExplorerSnippetInput) {
  const apiKey = normalizeExplorerApiKey(input.apiKey) || "your_api_key";
  const authHeader = input.authMode === "bearer"
    ? `-H "Authorization: Bearer ${apiKey}"`
    : `-H "X-API-Key: ${apiKey}"`;

  if (input.endpoint === "credits") {
    return `curl -X GET ${pathForEndpoint(input.apiBase, "credits")} \\
  ${authHeader}`;
  }

  return `curl -X POST ${pathForEndpoint(input.apiBase, "search")} \\
  -H "Content-Type: application/json" \\
  ${authHeader} \\
  -d '${jsonStringify(input.searchBody)}'`;
}

export function buildExplorerFetchSnippet(input: ExplorerSnippetInput) {
  const apiKey = normalizeExplorerApiKey(input.apiKey) || "your_api_key";
  const headers = {
    ...(input.endpoint === "search" ? { "Content-Type": "application/json" } : {}),
    ...buildAuthHeaders(input.authMode, apiKey),
  };

  if (input.endpoint === "credits") {
    return `const response = await fetch("${pathForEndpoint(input.apiBase, "credits")}", {
  method: "GET",
  headers: ${jsonStringify(headers)}
});

const data = await response.json();`;
  }

  return `const response = await fetch("${pathForEndpoint(input.apiBase, "search")}", {
  method: "POST",
  headers: ${jsonStringify(headers)},
  body: JSON.stringify(${jsonStringify(input.searchBody)})
});

const data = await response.json();`;
}

export const DOC_SECTIONS: DocsSectionLink[] = [
  { id: "overview", label: "Overview" },
  { id: "authentication", label: "Authentication" },
  { id: "credits", label: "Credits" },
  { id: "endpoints", label: "Endpoints" },
  { id: "filters", label: "Filters" },
  { id: "responses", label: "Responses" },
  { id: "errors", label: "Errors" },
  { id: "examples", label: "Examples" },
  { id: "try-it", label: "Try It" },
];

export const DOC_OVERVIEW_CARDS: DocOverviewCard[] = [
  {
    label: "Authentication",
    value: "X-API-Key or Bearer token",
    detail: "Use account-linked API keys with either header style. Keys spend credits from the key owner.",
  },
  {
    label: "Search Surface",
    value: "profile, channel, group, message",
    detail: "One search endpoint powers all four result types, with aliases normalized server-side.",
  },
  {
    label: "Credit Model",
    value: "Page 1 charges one credit",
    detail: "Later pages require a positive balance but do not charge the search a second time.",
  },
];

export const ENDPOINT_REFERENCES: EndpointReference[] = [
  {
    id: "search",
    method: "POST",
    path: "/api/v1/search",
    title: "Unified Search",
    description: "Search profiles, channels, groups, or messages with one stable endpoint.",
    auth: "Required",
    contentType: "application/json",
    notes: [
      "Accepts either q or query. The backend normalizes q into query before validation.",
      "Rate limiting is checked before search execution.",
      "Redactions and plan-level access checks are enforced server-side.",
    ],
  },
  {
    id: "credits",
    method: "GET",
    path: "/api/v1/credits",
    title: "Credits Lookup",
    description: "Read the current searchable credit balance for the API key owner.",
    auth: "Required",
    contentType: "none",
    notes: [
      "Returns the live balance for the key owner.",
      "Credit balances are not cached at the public API layer.",
    ],
  },
];

export const SEARCH_REQUEST_FIELDS: RequestField[] = [
  { name: "type", type: "\"profile\" | \"channel\" | \"group\" | \"message\"", required: true, description: "Selects which search schema and result shape to use." },
  { name: "q", type: "string", required: false, description: "Preferred shorthand query alias for public API callers." },
  { name: "query", type: "string", required: false, description: "Accepted alternative to q. Server normalization makes q and query equivalent." },
  { name: "filters", type: "object", required: false, description: "Type-specific filters. Aliases are normalized before search execution." },
  { name: "page", type: "number", required: false, description: "Minimum 1. Page 1 charges one credit; later pages require a positive balance." },
  { name: "limit", type: "number", required: false, description: "Minimum 1, maximum 100. Defaults to 25." },
];

export const FILTER_REFERENCE: Record<PublicApiSearchType, FilterRow[]> = {
  profile: [
    { field: "username", aliases: "username", type: "string", description: "Match a Telegram username." },
    { field: "displayName", aliases: "displayName, display_name", type: "string", description: "Match a profile display name." },
    { field: "phone", aliases: "phone, number", type: "string", description: "Match a phone number or phone-like input." },
    { field: "bio", aliases: "bio", type: "string", description: "Match text inside the profile bio." },
    { field: "userId", aliases: "userId, user_id", type: "string", description: "Match an exact Telegram user id." },
  ],
  channel: [
    { field: "username", aliases: "username", type: "string", description: "Match a channel username." },
    { field: "title", aliases: "title, displayName, display_name", type: "string", description: "Match the channel title." },
    { field: "description", aliases: "description, bio", type: "string", description: "Match channel description text." },
    { field: "channelId", aliases: "channelId, chatId, chat_id", type: "string", description: "Match an exact Telegram channel id." },
  ],
  group: [
    { field: "username", aliases: "username", type: "string", description: "Match a public group username when present." },
    { field: "displayName", aliases: "displayName, display_name", type: "string", description: "Match the group title." },
    { field: "description", aliases: "description, bio", type: "string", description: "Match the group description." },
    { field: "chatId", aliases: "chatId, chat_id", type: "string", description: "Match an exact Telegram group id." },
  ],
  message: [
    { field: "senderUsername", aliases: "senderUsername, username", type: "string", description: "Filter to a sender username." },
    { field: "senderUserId", aliases: "senderUserId, user_id", type: "string", description: "Filter to a sender Telegram user id." },
    { field: "chatId", aliases: "chatId, chat_id", type: "string", description: "Filter to a specific chat or channel." },
    { field: "keyword", aliases: "keyword", type: "string", description: "Optional keyword override if you want filters.keyword separate from q." },
    { field: "dateStart", aliases: "dateStart", type: "string", description: "ISO-like lower timestamp bound when supported by the search layer." },
    { field: "dateEnd", aliases: "dateEnd", type: "string", description: "ISO-like upper timestamp bound when supported by the search layer." },
    { field: "hasMedia", aliases: "hasMedia", type: "boolean", description: "Restrict matches to messages with or without media." },
    { field: "containsLinks", aliases: "containsLinks", type: "boolean", description: "Restrict matches based on whether the message contains links." },
    { field: "minLength", aliases: "minLength", type: "number", description: "Require a minimum message length." },
  ],
};

export const ERROR_REFERENCE: ErrorReference[] = [
  { status: 400, code: "invalid_search_request", description: "The request body did not satisfy the search schema.", trigger: "Missing type, invalid filters, invalid page/limit, or non-object body." },
  { status: 401, code: "api_key_required", description: "No API key was sent with the request.", trigger: "Neither X-API-Key nor Authorization: Bearer was present." },
  { status: 401, code: "invalid_api_key", description: "The API key could not be authenticated.", trigger: "Unknown, revoked, or inactive-key-owner token." },
  { status: 402, code: "insufficient_credits", description: "The request could not proceed because the owner lacks credits.", trigger: "Page 1 could not be charged or a later page has no positive balance." },
  { status: 403, code: "api_access_denied", description: "The account is not allowed to use public API access.", trigger: "Global setting, plan policy, or per-user override blocks access." },
  { status: 429, code: "rate_limited", description: "The request exceeded the API rate limit window.", trigger: "Too many requests for the same key or IP in the current minute." },
  { status: 500, code: "search_failed", description: "The search request failed unexpectedly.", trigger: "Unexpected search-layer or credit-layer error during search." },
  { status: 500, code: "server_error", description: "A non-search API request failed unexpectedly.", trigger: "Unexpected error during credits lookup or another non-search path." },
];

export const SUCCESS_RESPONSE_EXAMPLES = {
  search: {
    type: "profile",
    results: [
      {
        resultType: "profile",
        username: "alice",
        displayName: "Alice Example",
        profilePhoto: "https://cdn.example.com/profile.jpg",
        telegramUserId: "12345",
        basicMetadata: {
          firstSeen: "2026-01-02T03:04:05.000Z",
          lastSeen: "2026-04-20T11:22:33.000Z",
          isTelegramPremium: true,
          trackingStatus: "visible",
        },
        bio: "Product and security updates",
        phoneMasked: "+1••••••0000",
        relevance: {
          score: 89,
          confidence: "high",
          reasons: ["display name match", "bio match"],
        },
        redaction: {
          applied: false,
          type: "none",
          redactedFields: [],
          reason: null,
        },
      },
    ],
    total: 1,
    page: 1,
    limit: 25,
    creditsRemaining: 24,
    apiKey: {
      id: "key-1",
      name: "Website integration",
    },
  },
  credits: {
    balance: 24,
    userId: "user-1",
    apiKey: {
      id: "key-1",
      name: "Website integration",
    },
  },
  error: {
    error: "Invalid search request",
    code: "invalid_search_request",
    issues: [
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["type"],
        message: "Required",
      },
    ],
  },
};

export function buildExampleSnippets(apiBase: string) {
  return [
    {
      id: "search-curl",
      label: "curl",
      title: "Search with q alias",
      code: buildExplorerCurlSnippet({
        apiBase,
        apiKey: "your_api_key",
        endpoint: "search",
        authMode: "x-api-key",
        searchBody: createDefaultSearchRequest("profile"),
      }),
    },
    {
      id: "message-fetch",
      label: "JavaScript",
      title: "Message search with bearer auth",
      code: buildExplorerFetchSnippet({
        apiBase,
        apiKey: "your_api_key",
        endpoint: "search",
        authMode: "bearer",
        searchBody: createDefaultSearchRequest("message"),
      }),
    },
    {
      id: "credits-fetch",
      label: "JavaScript",
      title: "Credits lookup",
      code: buildExplorerFetchSnippet({
        apiBase,
        apiKey: "your_api_key",
        endpoint: "credits",
        authMode: "x-api-key",
        searchBody: createDefaultSearchRequest("profile"),
      }),
    },
  ];
}
