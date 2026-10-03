-- GAIN 2.4 hardening: authoritative referral relationship and compensating withdrawal ledger.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sponsor_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_sponsor_user_id ON users(sponsor_user_id);

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejection_reversal_ledger_id uuid REFERENCES wallet_ledger(id);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS settlement_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

COMMENT ON COLUMN users.sponsor_user_id IS 'Authoritative sponsor relationship. Browser-provided sponsor names/IDs are never trusted after bootstrap.';
COMMENT ON COLUMN withdrawals.rejection_reversal_ledger_id IS 'Compensating ledger entry restoring a withdrawal hold after rejection/cancellation.';

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
