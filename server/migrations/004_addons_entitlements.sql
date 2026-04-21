CREATE TABLE IF NOT EXISTS user_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  source TEXT NOT NULL DEFAULT 'addon' CHECK (source IN ('addon', 'admin', 'plan')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_code
  ON user_entitlements(user_id, code, status);

CREATE TABLE IF NOT EXISTS addon_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_session_id UUID UNIQUE NOT NULL REFERENCES payment_sessions(id) ON DELETE CASCADE,
  addon_code TEXT NOT NULL,
  addon_name TEXT NOT NULL,
  amount_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  granted_entitlement_id UUID REFERENCES user_entitlements(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_addon_purchases_user_id
  ON addon_purchases(user_id, created_at DESC);

ALTER TABLE payment_sessions DROP CONSTRAINT IF EXISTS payment_sessions_type_check;
ALTER TABLE payment_sessions ADD CONSTRAINT payment_sessions_type_check
  CHECK (type IN ('purchase', 'subscription', 'addon'));
