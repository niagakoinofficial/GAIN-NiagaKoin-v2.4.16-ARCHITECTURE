-- GAIN v4.2.16 exchange-account identity hardening.
-- Prevents two GAIN users from claiming the same exchange credential/account identity.
ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS identity_key text;
ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS identity_type text;
ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS identity_hint text;
ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS credential_fingerprint text;
ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS reported_identity_key text;
ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_exchange_accounts_identity_lookup
  ON exchange_accounts(lower(exchange), sandbox, identity_key)
  WHERE status = 'ACTIVE' AND identity_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_accounts_active_identity
  ON exchange_accounts(lower(exchange), sandbox, identity_key)
  WHERE status = 'ACTIVE' AND identity_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_accounts_active_credential_fingerprint
  ON exchange_accounts(lower(exchange), sandbox, credential_fingerprint)
  WHERE status = 'ACTIVE' AND credential_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_accounts_active_reported_identity
  ON exchange_accounts(lower(exchange), sandbox, reported_identity_key)
  WHERE status = 'ACTIVE' AND reported_identity_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exchange_accounts_user_status
  ON exchange_accounts(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS exchange_credential_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  sandbox boolean NOT NULL DEFAULT true,
  action text NOT NULL,
  previous_version integer,
  new_version integer NOT NULL,
  previous_credential_fingerprint text,
  new_credential_fingerprint text NOT NULL,
  previous_identity_key text,
  new_identity_key text NOT NULL,
  previous_reported_identity_key text,
  new_reported_identity_key text,
  previous_identity_type text,
  new_identity_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exchange_credential_history_user_time
  ON exchange_credential_history(user_id, created_at DESC);
