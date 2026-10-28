-- Shortstack schema. All timestamps are ISO-8601 UTC strings, except `day`
-- which is the UTC calendar day used by privacy-minimized analytics.
PRAGMA foreign_keys = ON;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  password_hash TEXT NOT NULL,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE UNIQUE INDEX users_email_uq ON users(email);
CREATE INDEX users_workspace_idx ON users(workspace_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  hostname TEXT NOT NULL COLLATE NOCASE,
  origin TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'pending')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  verified_at TEXT
);
CREATE UNIQUE INDEX domains_hostname_uq ON domains(hostname);
CREATE UNIQUE INDEX domains_one_default_uq ON domains(workspace_id) WHERE is_default = 1;

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  name TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE UNIQUE INDEX campaigns_workspace_name_uq ON campaigns(workspace_id, name);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  filename TEXT,
  raw_csv TEXT,
  headers_json TEXT NOT NULL,
  mapping_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'previewed', 'creating', 'completed', 'failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  commit_token TEXT NOT NULL,
  completed_at TEXT,
  raw_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX import_batches_workspace_idx ON import_batches(workspace_id, created_at DESC);

CREATE TABLE short_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  note TEXT,
  expires_at TEXT,
  expires_timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  archived_at TEXT,
  archived_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (slug = lower(slug)),
  CHECK (length(slug) BETWEEN 3 AND 64)
);
CREATE UNIQUE INDEX short_links_domain_slug_uq ON short_links(domain_id, slug);
CREATE INDEX short_links_workspace_idx ON short_links(workspace_id, archived_at, updated_at DESC);
CREATE INDEX short_links_campaign_idx ON short_links(workspace_id, campaign_id);
CREATE INDEX short_links_expiry_idx ON short_links(workspace_id, expires_at);

CREATE TABLE import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  slug TEXT,
  destination_url TEXT,
  campaign_name TEXT,
  note TEXT,
  expires_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'invalid', 'duplicate', 'excluded', 'created')),
  errors_json TEXT NOT NULL DEFAULT '[]',
  suggested_slug TEXT,
  created_link_id TEXT REFERENCES short_links(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (batch_id, row_number)
);
CREATE INDEX import_rows_batch_idx ON import_rows(batch_id, row_number);

CREATE TABLE click_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  link_id TEXT NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  referrer_domain TEXT NOT NULL,
  device_class TEXT NOT NULL CHECK (device_class IN ('desktop', 'mobile', 'tablet', 'bot', 'unknown')),
  created_at TEXT NOT NULL
);
CREATE INDEX click_events_link_day_idx ON click_events(link_id, day);
CREATE INDEX click_events_workspace_day_idx ON click_events(workspace_id, day);
CREATE INDEX click_events_created_idx ON click_events(created_at);

CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed', 'expired')),
  filters_json TEXT NOT NULL,
  file_key TEXT,
  file_name TEXT,
  row_count INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  expires_at TEXT
);
CREATE INDEX exports_workspace_idx ON exports(workspace_id, created_at DESC);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  idempotency_key TEXT NOT NULL,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  last_error TEXT,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX jobs_idempotency_uq ON jobs(idempotency_key);
CREATE INDEX jobs_claim_idx ON jobs(status, run_after);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_entity_idx ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX audit_log_workspace_idx ON audit_log(workspace_id, created_at DESC);

CREATE TRIGGER audit_log_immutable_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is immutable');
END;

CREATE TRIGGER audit_log_immutable_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is immutable');
END;

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
