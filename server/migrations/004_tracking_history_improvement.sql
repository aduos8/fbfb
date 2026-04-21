-- Add column to track when we last checked user_history
ALTER TABLE profile_tracking
  ADD COLUMN IF NOT EXISTS last_history_check_at TIMESTAMPTZ;

-- Initialize with last_checked_at for existing records
UPDATE profile_tracking
SET last_history_check_at = COALESCE(last_checked_at, NOW())
WHERE last_history_check_at IS NULL;
