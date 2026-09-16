-- IPO Watch schema.
-- Everything a user owns hangs off users.id and is filtered by it in every query;
-- IPO and GMP data is shared master data that only admins write.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------- identity ----------

CREATE TYPE user_role AS ENUM ('user', 'admin');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Refresh tokens are stored hashed: a database leak must not hand out sessions.
-- rotated_to chains a rotation, so reuse of an already-rotated token is detectable.
CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  rotated_to uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- ---------- IPO master data (admin-owned) ----------

CREATE TYPE verdict_tone AS ENUM ('go', 'wait', 'stop');

CREATE TABLE ipos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  slug             text NOT NULL UNIQUE,
  open_date        date,
  close_date       date,
  price_min        numeric(10,2),
  price_max        numeric(10,2),
  -- one lot at cut-off, in whole rupees; NULL until the band is announced
  lot_amount       integer,
  retail_quota     text,
  -- true renders the quota with the "35%*" indicative asterisk
  quota_indicative boolean NOT NULL DEFAULT false,
  rank             integer,
  -- ratings out of 5, in half steps; NULL means not rated yet
  fundamentals     numeric(2,1) CHECK (fundamentals BETWEEN 0 AND 5),
  valuation        numeric(2,1) CHECK (valuation   BETWEEN 0 AND 5),
  long_term        numeric(2,1) CHECK (long_term   BETWEEN 0 AND 5),
  listing          numeric(2,1) CHECK (listing     BETWEEN 0 AND 5),
  verdict          text NOT NULL DEFAULT 'Wait',
  verdict_tone     verdict_tone NOT NULL DEFAULT 'wait',
  registrar_name   text,
  registrar_url    text,
  scrape_key       text,   -- lowercase substring matched against the GMP source
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ipos_close_date_idx ON ipos(close_date DESC NULLS LAST);

-- Every scrape appends rather than overwrites, so a closed IPO keeps the number
-- it actually traded at and the admin console can chart movement.
CREATE TABLE gmp_quotes (
  id           bigserial PRIMARY KEY,
  ipo_id       uuid NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  gmp_pct      numeric(6,2),
  gmp_rupees   integer,
  source       text NOT NULL DEFAULT 'ipowatch.in',
  source_stamp text,
  is_manual    boolean NOT NULL DEFAULT false,
  captured_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gmp_quotes_latest_idx ON gmp_quotes(ipo_id, captured_at DESC);

CREATE TYPE run_status AS ENUM ('running', 'ok', 'failed');

CREATE TABLE gmp_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status        run_status NOT NULL DEFAULT 'running',
  matched_count integer NOT NULL DEFAULT 0,
  error         text,
  triggered_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX gmp_runs_started_idx ON gmp_runs(started_at DESC);

-- ---------- user-owned data ----------

-- PANs are encrypted at rest (AES-256-GCM, key from env). pan_hash is an HMAC
-- so we can enforce uniqueness and look one up without ever decrypting.
CREATE TABLE applicants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  pan_encrypted text NOT NULL,
  pan_hash      text NOT NULL,
  pan_last4     text NOT NULL,
  is_self       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pan_hash)
);
CREATE INDEX applicants_user_idx ON applicants(user_id);
-- at most one "this is me" per user
CREATE UNIQUE INDEX applicants_one_self_idx ON applicants(user_id) WHERE is_self;

CREATE TYPE allotment_status AS ENUM ('pending', 'allotted', 'not_allotted');

CREATE TABLE applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ipo_id        uuid NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  applicant_id  uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  amount        integer NOT NULL DEFAULT 0 CHECK (amount >= 0),
  allotment     allotment_status NOT NULL DEFAULT 'pending',
  allotment_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- one PAN can only apply once per IPO, which is the actual market rule
  UNIQUE (ipo_id, applicant_id)
);
CREATE INDEX applications_user_idx ON applications(user_id);
CREATE INDEX applications_ipo_idx  ON applications(ipo_id);

-- Who actually funded an application, when it wasn't the applicant's own money.
CREATE TABLE application_funders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  applicant_id   uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  amount         integer NOT NULL CHECK (amount >= 0),
  UNIQUE (application_id, applicant_id)
);

-- ---------- admin audit ----------

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

-- ---------- updated_at maintenance ----------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER ipos_touch         BEFORE UPDATE ON ipos         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER applicants_touch   BEFORE UPDATE ON applicants   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER applications_touch BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
