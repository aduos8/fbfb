-- TG OSINT Platform: Payments, Tracking, Notifications, Redactions
-- Run this migration to create all new tables

-- Purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount_cents INT NOT NULL,
  credits_purchased INT NOT NULL,
  oxapay_track_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('basic', 'intermediate', 'advanced')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  credits_per_month INT NOT NULL,
  price_cents INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Payment sessions table
CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  oxapay_track_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'subscription')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  order_id TEXT,
  amount_cents INT NOT NULL,
  credits INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Profile tracking table
CREATE TABLE IF NOT EXISTS profile_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  profile_user_id TEXT NOT NULL,
  profile_username TEXT,
  profile_display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_renewal_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cost_per_month INT NOT NULL DEFAULT 1
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN (
    'username_changed',
    'display_name_changed',
    'bio_updated',
    'profile_photo_changed',
    'premium_status_changed',
    'credits_low',
    'tracking_renewal',
    'tracking_expired',
    'subscription_expired',
    'system'
  )),
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Redactions table
CREATE TABLE IF NOT EXISTS redactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'channel', 'group')),
  target_id TEXT NOT NULL,
  redaction_type TEXT NOT NULL CHECK (redaction_type IN ('full', 'partial')),
  redacted_fields TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(target_type, target_id)
);

-- Vouchers table (add if not exists)
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  credits INT NOT NULL,
  max_uses INT,
  current_uses INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_oxapay_track_id ON purchases(oxapay_track_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_track_id ON payment_sessions(oxapay_track_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_expires ON payment_sessions(status, expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_profile_tracking_user_id ON profile_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_tracking_status ON profile_tracking(status);
CREATE INDEX IF NOT EXISTS idx_profile_tracking_renewal ON profile_tracking(status, last_renewal_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_redactions_target ON redactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
