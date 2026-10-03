CREATE TABLE IF NOT EXISTS exchange_certification_runs (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  firebase_uid text NOT NULL,
  exchange text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('authenticated_readonly','sandbox_demo_order','micro_live_order','reconcile','recovery')),
  mode text NOT NULL CHECK (mode IN ('READ_ONLY','SANDBOX_DEMO','MICRO_LIVE','RECONCILE','RECOVERY')),
  status text NOT NULL CHECK (status IN ('RUNNING','PASS','FAIL','BLOCKED','WARNING')),
  symbol text,
  side text,
  order_type text,
  client_order_id text,
  exchange_order_id text,
  requested_qty numeric,
  requested_price numeric,
  expected_notional numeric,
  exchange_status text,
  filled_qty numeric,
  average_price numeric,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_cert_runs_user_exchange_created
  ON exchange_certification_runs(firebase_uid, exchange, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_cert_runs_order
  ON exchange_certification_runs(firebase_uid, exchange, exchange_order_id)
  WHERE exchange_order_id IS NOT NULL;
