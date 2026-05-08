-- ============================================================
-- MaxVision LinkedIn MCP — Postgres init schema
-- Idempotente: pode rodar múltiplas vezes.
-- Executado automaticamente pelo container Postgres na primeira subida
-- via /docker-entrypoint-initdb.d/01-init.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Accounts (multi-conta cookie pool)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  cookie_encrypted BYTEA NOT NULL,
  cookie_expires_at TIMESTAMPTZ NOT NULL,
  rate_limit_bucket JSONB NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('active', 'paused', 'banned')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts (status);

-- Jobs cache
CREATE TABLE IF NOT EXISTS jobs_cache (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  match_score REAL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_fetched ON jobs_cache (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs_cache (source);
CREATE INDEX IF NOT EXISTS idx_jobs_expires ON jobs_cache (expires_at);

-- Profiles cache
CREATE TABLE IF NOT EXISTS profiles_cache (
  public_id TEXT PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_profiles_expires ON profiles_cache (expires_at);

-- Applications tracking
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  job_url TEXT NOT NULL,
  job_title TEXT,
  company TEXT,
  status TEXT NOT NULL,
  resume_used TEXT,
  cover_letter TEXT,
  answers JSONB,
  screenshot_path TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  history JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_applications_account ON applications (account_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

-- Messages drafts (DM com aprovação)
CREATE TABLE IF NOT EXISTS messages_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  recipient_url TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT CHECK (status IN ('draft', 'sent', 'rejected')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drafts_account ON messages_drafts (account_id, created_at DESC);

-- Rate limit events
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_account_time ON rate_limit_events (account_id, occurred_at DESC);

-- Captcha events (anti-detect monitoring)
CREATE TABLE IF NOT EXISTS captcha_events (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  context TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captcha_account ON captcha_events (account_id, occurred_at DESC);

-- License key cache (Pro/Agency)
CREATE TABLE IF NOT EXISTS license_cache (
  key_hash TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  features JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (LGPD compliance)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_log (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action, occurred_at DESC);

-- Trigger: update updated_at em accounts
CREATE OR REPLACE FUNCTION trg_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_update_timestamp ON accounts;
CREATE TRIGGER accounts_update_timestamp
BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION trg_update_timestamp();

-- Cleanup job: jobs_cache expirados (rodar via cron externo)
-- DELETE FROM jobs_cache WHERE expires_at < NOW();
-- DELETE FROM profiles_cache WHERE expires_at < NOW();
-- DELETE FROM rate_limit_events WHERE occurred_at < NOW() - INTERVAL '30 days';
