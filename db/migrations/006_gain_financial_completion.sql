-- GAIN financial completion: idempotent gas topups, auto-refill configuration,
-- referral trading/top-up settlement projections.
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_idempotency_key
  ON wallet_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS gas_auto_refill_configs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  threshold_usdt numeric(30,10) NOT NULL DEFAULT 3,
  refill_usdt numeric(30,10) NOT NULL DEFAULT 10,
  max_daily_usdt numeric(30,10) NOT NULL DEFAULT 50,
  daily_refilled_usdt numeric(30,10) NOT NULL DEFAULT 0,
  daily_refill_date date NOT NULL DEFAULT CURRENT_DATE,
  last_refilled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_source_type
  ON referral_events(source_user_id, event_type, created_at DESC);
