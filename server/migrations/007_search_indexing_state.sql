CREATE TABLE IF NOT EXISTS search_index_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode VARCHAR(32) NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status VARCHAR(32) NOT NULL DEFAULT 'running',
  source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  indexed_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  task_uids JSONB NOT NULL DEFAULT '[]'::jsonb,
  batch_uids JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_text TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_search_index_runs_status ON search_index_runs(status);
CREATE INDEX IF NOT EXISTS idx_search_index_runs_mode ON search_index_runs(mode);
CREATE INDEX IF NOT EXISTS idx_search_index_runs_started_at ON search_index_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS search_index_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  entity_key TEXT NOT NULL,
  source_ref JSONB NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_index_outbox_claim
  ON search_index_outbox(status, available_at, scope, id);
CREATE INDEX IF NOT EXISTS idx_search_index_outbox_entity
  ON search_index_outbox(scope, entity_key, status);
