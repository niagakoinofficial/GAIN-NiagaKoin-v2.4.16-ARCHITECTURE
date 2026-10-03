-- Durable 24-hour GAIN login verification sessions.
-- The raw session token remains only in the HttpOnly browser cookie; PostgreSQL stores its SHA-256 hash.
CREATE TABLE IF NOT EXISTS auth_session_elevations (
  token_hash TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_session_elevations_uid_expires
  ON auth_session_elevations (firebase_uid, expires_at);
