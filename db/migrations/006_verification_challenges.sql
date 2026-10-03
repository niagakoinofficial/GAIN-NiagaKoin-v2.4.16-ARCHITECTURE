-- Durable email/login verification challenges.
-- Redis remains the fast cache; PostgreSQL survives application restarts.
CREATE TABLE IF NOT EXISTS auth_verification_challenges (
  firebase_uid text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('login', 'email')),
  code_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  sent_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firebase_uid, kind)
);

CREATE INDEX IF NOT EXISTS idx_auth_verification_challenges_expiry
  ON auth_verification_challenges (expires_at);
