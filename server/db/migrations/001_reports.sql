CREATE TABLE scan (
  id uuid PRIMARY KEY,
  capability_digest bytea NOT NULL CHECK (octet_length(capability_digest) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '24 hours')
);
CREATE INDEX scan_expiry_idx ON scan(expires_at);
CREATE TABLE scan_cancellation (
  scan_id uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);
CREATE INDEX scan_cancellation_expiry_idx ON scan_cancellation(expires_at);
