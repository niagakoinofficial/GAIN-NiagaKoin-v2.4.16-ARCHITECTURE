-- Financial hardening: activation requests must be replay-safe.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_licenses_idempotency_key ON licenses(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Deposit replay safety: a tx hash may credit only once per network.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deposits_network_tx_hash ON deposits(network, tx_hash);
