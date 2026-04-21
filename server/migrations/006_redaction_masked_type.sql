-- Add 'masked' to redaction_type check constraint
ALTER TABLE redactions DROP CONSTRAINT IF EXISTS redactions_redaction_type_check;
ALTER TABLE redactions ADD CONSTRAINT redactions_redaction_type_check CHECK (redaction_type IN ('full', 'partial', 'masked'));
