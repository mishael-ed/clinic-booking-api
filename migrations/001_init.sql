CREATE TABLE IF NOT EXISTS slots (
  id        text PRIMARY KEY,
  provider  text NOT NULL,
  start_at  timestamptz NOT NULL,
  end_at    timestamptz NOT NULL,
  start_raw text NOT NULL,
  end_raw   text NOT NULL
);
CREATE INDEX IF NOT EXISTS slots_start_idx ON slots (start_at, id);

CREATE TABLE IF NOT EXISTS bookings (
  id         text PRIMARY KEY,
  seq        bigserial NOT NULL,
  slot_id    text NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  name       text NOT NULL,
  email      text NOT NULL,
  status     text NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_confirmed_per_slot
  ON bookings (slot_id) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_email_seq_idx ON bookings (email, seq);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           text PRIMARY KEY,
  request_hash  text NOT NULL,
  status_code   int,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_attempts (
  email        text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS rate_limit_email_idx ON rate_limit_attempts (email, attempted_at);
