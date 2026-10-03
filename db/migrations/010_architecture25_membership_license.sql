-- Architecture 25: make member lifecycle and license entitlement explicit.
-- users.status is the member lifecycle; licenses.status is the entitlement lifecycle.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_status_architecture25_chk') THEN
    ALTER TABLE users ADD CONSTRAINT users_status_architecture25_chk
      CHECK (status IN ('active','suspended','closed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_status_architecture25_chk') THEN
    ALTER TABLE licenses ADD CONSTRAINT licenses_status_architecture25_chk
      CHECK (status IN ('ACTIVE','SUSPENDED','EXPIRED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_status_member ON users(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licenses_entitlement_lookup
  ON licenses(user_id, status, expires_at, activated_at DESC);
