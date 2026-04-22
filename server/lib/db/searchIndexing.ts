import { sql } from "../db";

export type SearchIndexScope = "profiles" | "chats" | "messages";
export type SearchIndexRunMode = "full_reindex" | "sync";
export type SearchIndexRunStatus = "running" | "succeeded" | "failed";
export type SearchIndexEventType =
  | "profile_upsert"
  | "profile_delete"
  | "chat_upsert"
  | "chat_delete"
  | "message_upsert"
  | "message_delete"
  | "profile_messages_refresh"
  | "chat_messages_refresh";

export type SearchIndexRunRecord = {
  id: string;
  mode: SearchIndexRunMode;
  scopes: SearchIndexScope[];
  status: SearchIndexRunStatus;
  source_counts: Record<string, unknown>;
  indexed_counts: Record<string, unknown>;
  task_uids: number[];
  batch_uids: number[];
  progress_summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  error_text: string | null;
  started_at: Date;
  finished_at: Date | null;
};

export type SearchIndexOutboxRecord = {
  id: number;
  event_type: SearchIndexEventType;
  scope: SearchIndexScope;
  entity_key: string;
  source_ref: Record<string, unknown>;
  payload: Record<string, unknown>;
  status: string;
  attempt_count: number;
  available_at: Date;
  claimed_at: Date | null;
  processed_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type EnqueueSearchIndexEventInput = {
  eventType: SearchIndexEventType;
  scope: SearchIndexScope;
  entityKey: string;
  sourceRef: Record<string, unknown>;
  payload?: Record<string, unknown>;
  availableAt?: Date;
};

type UpdateRunInput = {
  status?: SearchIndexRunStatus;
  sourceCounts?: Record<string, unknown>;
  indexedCounts?: Record<string, unknown>;
  taskUids?: number[];
  batchUids?: number[];
  progressSummary?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  errorText?: string | null;
  finishedAt?: Date | null;
};

function toJsonb(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseNumericArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function mergeObjects<T extends Record<string, unknown>>(base: T, extra?: Record<string, unknown>) {
  if (!extra) {
    return base;
  }
  return { ...base, ...extra };
}

export async function createSearchIndexRun(input: {
  mode: SearchIndexRunMode;
  scopes: SearchIndexScope[];
  metadata?: Record<string, unknown>;
}) {
  const [row] = await sql<SearchIndexRunRecord[]>`
    INSERT INTO search_index_runs (mode, scopes, metadata)
    VALUES (
      ${input.mode},
      ${input.scopes},
      CAST(${toJsonb(input.metadata ?? {})} AS jsonb)
    )
    RETURNING *
  `;

  if (!row) {
    throw new Error("Failed to create search index run");
  }

  return row;
}

export async function updateSearchIndexRun(runId: string, input: UpdateRunInput) {
  const [existing] = await sql<SearchIndexRunRecord[]>`
    SELECT *
    FROM search_index_runs
    WHERE id = ${runId}
    LIMIT 1
  `;

  if (!existing) {
    throw new Error(`Search index run not found: ${runId}`);
  }

  const nextTaskUids = input.taskUids
    ? Array.from(new Set([...parseNumericArray(existing.task_uids), ...input.taskUids]))
    : parseNumericArray(existing.task_uids);
  const nextBatchUids = input.batchUids
    ? Array.from(new Set([...parseNumericArray(existing.batch_uids), ...input.batchUids]))
    : parseNumericArray(existing.batch_uids);

  const [row] = await sql<SearchIndexRunRecord[]>`
    UPDATE search_index_runs
    SET
      status = ${input.status ?? existing.status},
      source_counts = CAST(${toJsonb(mergeObjects((existing.source_counts ?? {}) as Record<string, unknown>, input.sourceCounts))} AS jsonb),
      indexed_counts = CAST(${toJsonb(mergeObjects((existing.indexed_counts ?? {}) as Record<string, unknown>, input.indexedCounts))} AS jsonb),
      task_uids = CAST(${toJsonb(nextTaskUids)} AS jsonb),
      batch_uids = CAST(${toJsonb(nextBatchUids)} AS jsonb),
      progress_summary = CAST(${toJsonb(mergeObjects((existing.progress_summary ?? {}) as Record<string, unknown>, input.progressSummary))} AS jsonb),
      metadata = CAST(${toJsonb(mergeObjects((existing.metadata ?? {}) as Record<string, unknown>, input.metadata))} AS jsonb),
      error_text = ${input.errorText === undefined ? existing.error_text : input.errorText},
      finished_at = ${input.finishedAt === undefined ? existing.finished_at : input.finishedAt}
    WHERE id = ${runId}
    RETURNING *
  `;

  if (!row) {
    throw new Error(`Failed to update search index run: ${runId}`);
  }

  return row;
}

export async function markSearchIndexRunSucceeded(runId: string, input: Omit<UpdateRunInput, "status" | "finishedAt" | "errorText"> = {}) {
  return updateSearchIndexRun(runId, {
    ...input,
    status: "succeeded",
    errorText: null,
    finishedAt: new Date(),
  });
}

export async function markSearchIndexRunFailed(runId: string, error: unknown, input: Omit<UpdateRunInput, "status" | "finishedAt" | "errorText"> = {}) {
  return updateSearchIndexRun(runId, {
    ...input,
    status: "failed",
    errorText: error instanceof Error ? error.message : String(error),
    finishedAt: new Date(),
  });
}

export async function enqueueSearchIndexEvents(events: EnqueueSearchIndexEventInput[]) {
  if (events.length === 0) {
    return [];
  }

  const inserted: SearchIndexOutboxRecord[] = [];
  for (const event of events) {
    const [row] = await sql<SearchIndexOutboxRecord[]>`
      INSERT INTO search_index_outbox (
        event_type,
        scope,
        entity_key,
        source_ref,
        payload,
        available_at
      )
      VALUES (
        ${event.eventType},
        ${event.scope},
        ${event.entityKey},
        CAST(${toJsonb(event.sourceRef)} AS jsonb),
        CAST(${toJsonb(event.payload ?? {})} AS jsonb),
        ${event.availableAt ?? new Date()}
      )
      RETURNING *
    `;

    if (row) {
      inserted.push(row);
    }
  }

  return inserted;
}

export async function claimSearchIndexEvents(limit: number, scopes?: SearchIndexScope[]) {
  const normalizedLimit = Math.max(1, limit);
  const rows = scopes && scopes.length > 0
    ? await sql<SearchIndexOutboxRecord[]>`
        WITH claimable AS (
          SELECT id
          FROM search_index_outbox
          WHERE status = 'pending'
            AND available_at <= NOW()
            AND scope = ANY(${scopes})
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT ${normalizedLimit}
        )
        UPDATE search_index_outbox AS outbox
        SET
          status = 'processing',
          claimed_at = NOW(),
          updated_at = NOW(),
          attempt_count = outbox.attempt_count + 1
        FROM claimable
        WHERE outbox.id = claimable.id
        RETURNING outbox.*
      `
    : await sql<SearchIndexOutboxRecord[]>`
        WITH claimable AS (
          SELECT id
          FROM search_index_outbox
          WHERE status = 'pending'
            AND available_at <= NOW()
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT ${normalizedLimit}
        )
        UPDATE search_index_outbox AS outbox
        SET
          status = 'processing',
          claimed_at = NOW(),
          updated_at = NOW(),
          attempt_count = outbox.attempt_count + 1
        FROM claimable
        WHERE outbox.id = claimable.id
        RETURNING outbox.*
      `;

  return rows;
}

export async function markSearchIndexEventsProcessed(eventIds: number[]) {
  if (eventIds.length === 0) {
    return;
  }

  await sql`
    UPDATE search_index_outbox
    SET
      status = 'processed',
      processed_at = NOW(),
      claimed_at = NULL,
      updated_at = NOW(),
      last_error = NULL
    WHERE id = ANY(${eventIds})
  `;
}

export async function retrySearchIndexEvent(eventId: number, error: unknown, delaySeconds = 30) {
  const normalizedDelay = Math.max(1, delaySeconds);
  await sql`
    UPDATE search_index_outbox
    SET
      status = 'pending',
      available_at = NOW() + (${normalizedDelay} * INTERVAL '1 second'),
      claimed_at = NULL,
      updated_at = NOW(),
      last_error = ${error instanceof Error ? error.message : String(error)}
    WHERE id = ${eventId}
  `;
}
