-- Marketplace Skill Subscriptions Table
-- Tracks user subscriptions, quotas, and usage for ChittyOS Marketplace Skill

CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL, -- ChittyID
  claude_user_id VARCHAR(255) NOT NULL UNIQUE, -- Claude Marketplace user ID
  tier VARCHAR(50) NOT NULL DEFAULT 'basic', -- basic, professional, enterprise
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, suspended, cancelled

  -- Usage tracking
  cases_used INTEGER NOT NULL DEFAULT 0,
  evidence_items_used INTEGER NOT NULL DEFAULT 0,
  trust_scores_used INTEGER NOT NULL DEFAULT 0,

  -- Billing period
  period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Indexes
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES identities(chitty_id) ON DELETE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_claude_user_id ON marketplace_subscriptions(claude_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_user_id ON marketplace_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_status ON marketplace_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_tier ON marketplace_subscriptions(tier);

-- Usage tracking events (optional - for analytics)
CREATE TABLE IF NOT EXISTS marketplace_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL,
  resource_type VARCHAR(50) NOT NULL, -- case, evidence, trust_score
  amount INTEGER NOT NULL DEFAULT 1,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_subscription_id FOREIGN KEY (subscription_id) REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_marketplace_usage_events_subscription_id ON marketplace_usage_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_usage_events_timestamp ON marketplace_usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_marketplace_usage_events_resource_type ON marketplace_usage_events(resource_type);

-- Function to reset monthly usage counters
CREATE OR REPLACE FUNCTION reset_monthly_usage() RETURNS void AS $$
BEGIN
  UPDATE marketplace_subscriptions
  SET
    cases_used = 0,
    evidence_items_used = 0,
    trust_scores_used = 0,
    period_start = NOW(),
    period_end = NOW() + INTERVAL '30 days',
    updated_at = NOW()
  WHERE period_end < NOW() AND status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Comment the tables
COMMENT ON TABLE marketplace_subscriptions IS 'Tracks user subscriptions for ChittyOS Marketplace Skill';
COMMENT ON TABLE marketplace_usage_events IS 'Logs individual usage events for analytics';
COMMENT ON COLUMN marketplace_subscriptions.tier IS 'Subscription tier: basic (5 cases), professional (50 cases), enterprise (unlimited)';
COMMENT ON COLUMN marketplace_subscriptions.status IS 'Subscription status: active, suspended (payment failed), cancelled';
