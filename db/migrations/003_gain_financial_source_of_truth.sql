-- GAIN financial/trading source of truth. PostgreSQL 15+.
-- This migration is additive and keeps the existing core tables compatible.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_member_id_nonnull ON users(member_id) WHERE member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency text NOT NULL,
  available_balance numeric(30,10) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  locked_balance numeric(30,10) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  total_inflow numeric(30,10) NOT NULL DEFAULT 0 CHECK (total_inflow >= 0),
  total_outflow numeric(30,10) NOT NULL DEFAULT 0 CHECK (total_outflow >= 0),
  gas_reserve numeric(30,10) NOT NULL DEFAULT 0 CHECK (gas_reserve >= 0),
  non_cash_gas_bonus numeric(30,10) NOT NULL DEFAULT 0 CHECK (non_cash_gas_bonus >= 0),
  withdrawable_trading_yield numeric(30,10) NOT NULL DEFAULT 0 CHECK (withdrawable_trading_yield >= 0),
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
  amount numeric(30,10) NOT NULL CHECK (amount > 0),
  balance_before numeric(30,10) NOT NULL,
  balance_after numeric(30,10) NOT NULL CHECK (balance_after >= 0),
  entry_type text NOT NULL,
  reference_type text,
  reference_id text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_account_time ON wallet_ledger(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference ON wallet_ledger(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'USDT',
  network text NOT NULL,
  tx_hash text NOT NULL,
  destination_address text,
  amount numeric(30,10) NOT NULL CHECK (amount > 0),
  block_number bigint,
  confirmations integer NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED','CREDITED')),
  verified_at timestamptz,
  credited_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(network, tx_hash)
);
CREATE INDEX IF NOT EXISTS idx_deposits_user_time ON deposits(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'USDT',
  network text NOT NULL,
  destination_address text NOT NULL,
  amount numeric(30,10) NOT NULL CHECK (amount > 0),
  fee numeric(30,10) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  net_amount numeric(30,10) NOT NULL CHECK (net_amount > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REVIEW','PROCESSING','SENT','CONFIRMED','REJECTED','FAILED','CANCELLED')),
  tx_hash text,
  idempotency_key text UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  processed_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_time ON withdrawals(user_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'USDT',
  amount numeric(30,10) NOT NULL CHECK (amount > 0),
  fee numeric(30,10) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','REJECTED','REVERSED')),
  idempotency_key text UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_transfers_sender_time ON transfers(sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_recipient_time ON transfers(recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tier text NOT NULL,
  license_type text NOT NULL DEFAULT 'lifetime',
  name text NOT NULL,
  fee numeric(30,10) NOT NULL,
  trading_bonus numeric(30,10) NOT NULL DEFAULT 0,
  max_active_bots integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(user_id, tier, activated_at)
);
CREATE INDEX IF NOT EXISTS idx_licenses_user_status ON licenses(user_id, status);

CREATE TABLE IF NOT EXISTS referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  gross_amount numeric(30,10) NOT NULL DEFAULT 0,
  reward_amount numeric(30,10) NOT NULL DEFAULT 0,
  cashable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_referral_sponsor_time ON referral_events(sponsor_user_id, created_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_time ON orders(user_id, created_at DESC);

ALTER TABLE fills ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS bot_runtime_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  status text NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_runtime_snapshots_bot_time ON bot_runtime_snapshots(bot_id, created_at DESC);

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_type text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS ip_hash text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_events(user_id, created_at DESC);

-- Immutable financial records: no application UPDATE/DELETE path should exist.
-- Database-level protection is intentionally deferred to a dedicated DB role in production.
COMMENT ON TABLE wallet_ledger IS 'Append-only financial ledger. Application must never update or delete rows.';
COMMENT ON TABLE audit_events IS 'Append-only audit trail. Application must never update or delete rows.';
COMMENT ON TABLE fills IS 'Exchange execution facts; corrections require compensating records, not mutation.';

CREATE TABLE IF NOT EXISTS security_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  two_factor_secret_ciphertext text,
  two_factor_secret_iv text,
  two_factor_secret_auth_tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE security_credentials ADD COLUMN IF NOT EXISTS last_totp_counter bigint;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS external_bot_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bots_external_bot_id ON bots(external_bot_id) WHERE external_bot_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS exchange_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  sandbox boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange)
);
CREATE SEQUENCE IF NOT EXISTS gain_member_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_accounts_user_exchange ON exchange_accounts(user_id, exchange);
