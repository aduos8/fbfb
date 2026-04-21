ALTER TABLE profile_tracking
  ADD COLUMN IF NOT EXISTS observed_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_detected_change_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id UUID NOT NULL REFERENCES profile_tracking(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_user_id TEXT NOT NULL,
  profile_username TEXT,
  field_name TEXT NOT NULL CHECK (field_name IN (
    'username',
    'display_name',
    'bio',
    'profile_photo',
    'phone',
    'premium_status'
  )),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_tracking_id_created_at
  ON tracking_events(tracking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_user_id_created_at
  ON tracking_events(user_id, created_at DESC);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'username_changed',
    'display_name_changed',
    'bio_updated',
    'profile_photo_changed',
    'phone_changed',
    'premium_status_changed',
    'credits_low',
    'tracking_renewal',
    'tracking_expired',
    'subscription_expired',
    'system'
  ));
