import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("searchIndex adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.SEARCH_BACKEND;
    delete process.env.OPENSEARCH_URL;
    delete process.env.OPENSEARCH_USERNAME;
    delete process.env.OPENSEARCH_PASSWORD;
    delete process.env.MEILISEARCH_URL;
    delete process.env.MEILISEARCH_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps message content searchable", async () => {
    const { MESSAGE_SEARCHABLE_ATTRIBUTES } = await import("./searchIndex");
    expect(MESSAGE_SEARCHABLE_ATTRIBUTES).toContain("content");
  });

  it("treats a yellow OpenSearch cluster as healthy", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "yellow" }), { status: 200 })
    );

    const { healthCheckSearchBackend } = await import("./searchIndex");
    const result = await healthCheckSearchBackend();

    expect(result).toEqual({
      backend: "opensearch",
      status: "yellow",
      healthy: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/_cluster/health",
      expect.objectContaining({})
    );
  });

  it("builds OpenSearch bulk upsert payloads with deterministic document ids", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: false, items: [{ index: { status: 201 } }] }), {
        status: 200,
      })
    );

    const { updateDocuments } = await import("./searchIndex");
    const task = await updateDocuments("messages", [
      {
        documentId: "c1_m1",
        content: "hello",
      },
    ]);

    expect(task.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/messages/_bulk?refresh=wait_for",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
        body: expect.stringContaining('"index":{"_index":"messages","_id":"c1_m1"}'),
      })
    );
  });

  it("can skip OpenSearch bulk refresh waits for background indexing", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: false, items: [{ index: { status: 201 } }] }), {
        status: 200,
      })
    );

    const { updateDocuments } = await import("./searchIndex");
    await updateDocuments("messages", [
      {
        documentId: "c1_m1",
        content: "hello",
      },
    ], {
      refresh: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/messages/_bulk",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("normalizes OpenSearch search totals and highlights", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          took: 7,
          hits: {
            total: { value: 5, relation: "eq" },
            hits: [
              {
                _id: "c1_m1",
                _score: 2.4,
                _source: {
                  documentId: "c1_m1",
                  content: "hello world",
                },
                highlight: {
                  content: ["<mark>hello</mark> world"],
                },
              },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const { searchIndex } = await import("./searchIndex");
    const response = await searchIndex<{ documentId: string; content: string }>("messages", {
      q: "hello",
      filters: [{ field: "chatId", operator: "eq", value: "c1" }],
      page: 2,
      hitsPerPage: 10,
      attributesToHighlight: ["content"],
      cropLength: 120,
      showRankingScore: true,
      sort: ["timestampMs:desc"],
    });

    expect(response.totalHits).toBe(5);
    expect(response.estimatedTotalHits).toBe(5);
    expect(response.page).toBe(2);
    expect(response.hitsPerPage).toBe(10);
    expect(response.processingTimeMs).toBe(7);
    expect(response.hits[0]).toMatchObject({
      documentId: "c1_m1",
      content: "hello world",
      _rankingScore: 2.4,
      _formatted: {
        content: "<mark>hello</mark> world",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/messages/_search",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"track_total_hits":true'),
      })
    );
  });

  it("uses AND semantics for multi-word OpenSearch message queries", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          took: 3,
          hits: {
            total: { value: 0, relation: "eq" },
            hits: [],
          },
        }),
        { status: 200 }
      )
    );

    const { searchIndex } = await import("./searchIndex");
    await searchIndex("messages", {
      q: "i shat",
      page: 1,
      hitsPerPage: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/messages/_search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          from: 0,
          size: 25,
          track_total_hits: true,
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: "i shat",
                    fields: [
                      "content",
                      "senderUsername",
                      "senderDisplayName",
                      "chatTitle",
                      "chatUsername",
                    ],
                    operator: "and",
                    fuzziness: "AUTO",
                  },
                },
              ],
              filter: [],
            },
          },
        }),
      })
    );
  });

  it("uses wildcard matching for short OpenSearch profile queries", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          took: 2,
          hits: {
            total: { value: 1, relation: "eq" },
            hits: [
              {
                _id: "u1",
                _score: 1.1,
                _source: {
                  userId: "u1",
                  username: "alice",
                  displayName: "Alice",
                },
              },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const { searchIndex } = await import("./searchIndex");
    await searchIndex("profiles", {
      q: "a",
      page: 1,
      hitsPerPage: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/profiles/_search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          from: 0,
          size: 25,
          track_total_hits: true,
          query: {
            bool: {
              must: [
                {
                  bool: {
                    should: [
                      {
                        wildcard: {
                          username: {
                            value: "*a*",
                            case_insensitive: true,
                          },
                        },
                      },
                      {
                        wildcard: {
                          displayName: {
                            value: "*a*",
                            case_insensitive: true,
                          },
                        },
                      },
                      {
                        wildcard: {
                          bio: {
                            value: "*a*",
                            case_insensitive: true,
                          },
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
              ],
              filter: [],
            },
          },
        }),
      })
    );
  });

  it("recreates an OpenSearch alias-backed index when deleting all documents", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    let aliasLookups = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/_alias/profiles__shadow_run")) {
        aliasLookups += 1;
        if (aliasLookups === 1) {
          return new Response(JSON.stringify({
            profiles__shadow_run__backing_v1: { aliases: { profiles__shadow_run: {} } },
          }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      }
      if (url.endsWith("/profiles__shadow_run__backing_v1") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      }
      if (url.endsWith("/profiles__shadow_run__backing_v1") && init?.method === "HEAD") {
        return new Response(null, { status: 404 });
      }
      if (url.endsWith("/profiles__shadow_run__backing_v1") && init?.method === "PUT") {
        return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    const { deleteAllDocuments } = await import("./searchIndex");
    const task = await deleteAllDocuments("profiles__shadow_run");

    expect(task.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/profiles__shadow_run__backing_v1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/profiles__shadow_run__backing_v1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"profiles__shadow_run"'),
      })
    );
  });

  it("refreshes an OpenSearch index on demand", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ _shards: { successful: 1 } }), { status: 200 })
    );

    const { refreshIndex } = await import("./searchIndex");
    const task = await refreshIndex("messages__shadow_run");

    expect(task.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/messages__shadow_run/_refresh",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("updates OpenSearch dynamic settings on alias-backed indexes", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/_alias/messages__shadow_run")) {
        return new Response(JSON.stringify({
          messages__shadow_run__backing_v1: { aliases: { messages__shadow_run: {} } },
        }), { status: 200 });
      }
      if (url.endsWith("/messages__shadow_run__backing_v1/_settings")) {
        return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    const { updateIndexSettings } = await import("./searchIndex");
    const task = await updateIndexSettings("messages__shadow_run", {
      refresh_interval: "-1",
    });

    expect(task.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/messages__shadow_run__backing_v1/_settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          index: {
            refresh_interval: "-1",
          },
        }),
      })
    );
  });

  it("omits create-only OpenSearch settings when updating existing indexes", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/_alias/profiles")) {
        return new Response(JSON.stringify({
          profiles__backing_v1: { aliases: { profiles: {} } },
        }), { status: 200 });
      }
      if (url.endsWith("/profiles__backing_v1/_settings")) {
        return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    const { updateIndexSettings } = await import("./searchIndex");
    await updateIndexSettings("profiles", {
      number_of_shards: 1,
      number_of_replicas: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://opensearch:9200/profiles__backing_v1/_settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          index: {
            number_of_replicas: 0,
          },
        }),
      })
    );
  });

  it("uses the OpenSearch aliases API for atomic alias swaps", async () => {
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch:9200";
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/_alias/messages")) {
        return new Response(JSON.stringify({
          messages__backing_v1: { aliases: { messages: {} } },
        }), { status: 200 });
      }
      if (url.endsWith("/_alias/messages__shadow_run")) {
        return new Response(JSON.stringify({
          messages__shadow_run__backing_v1: { aliases: { messages__shadow_run: {} } },
        }), { status: 200 });
      }
      if (url.endsWith("/_aliases")) {
        return new Response(JSON.stringify({ acknowledged: true, init }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { swapIndexes } = await import("./searchIndex");
    const task = await swapIndexes([
      {
        indexes: ["messages", "messages__shadow_run"],
      },
    ]);

    expect(task.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://opensearch:9200/_aliases",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          actions: [
            {
              remove: {
                index: "messages__backing_v1",
                alias: "messages",
              },
            },
            {
              add: {
                index: "messages__shadow_run__backing_v1",
                alias: "messages",
                is_write_index: true,
              },
            },
            {
              remove: {
                index: "messages__shadow_run__backing_v1",
                alias: "messages__shadow_run",
              },
            },
          ],
        }),
      })
    );
    expect(task.details).toEqual({
      swaps: [
        {
          liveAlias: "messages",
          shadowAlias: "messages__shadow_run",
          previousLiveTargets: ["messages__backing_v1"],
          promotedTargets: ["messages__shadow_run__backing_v1"],
        },
      ],
    });
  });
});
