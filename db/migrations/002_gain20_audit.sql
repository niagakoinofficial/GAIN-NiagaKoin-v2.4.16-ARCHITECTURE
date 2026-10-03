CREATE TABLE IF NOT EXISTS audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, bot_id uuid, event_type text NOT NULL, correlation_id text, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_audit_bot_time ON audit_events(bot_id,created_at DESC);
