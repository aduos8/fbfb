ALTER TABLE redactions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_redactions_active ON redactions(target_type, target_id) WHERE is_active = true;

COMMENT ON COLUMN redactions.is_active IS 'When false, redaction is disabled but preserved for audit trail';
