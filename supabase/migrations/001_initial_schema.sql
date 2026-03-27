-- Open Context: Initial database schema
-- Migrated from local JSON file storage to Supabase Postgres

-- API keys (simple auth, no user accounts yet)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  org_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_projects_org ON projects(org_id);

-- Modules
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('page', 'component', 'module', 'api', 'hook', 'util', 'config')),
  path TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  pending_context TEXT,
  pending_context_meta JSONB,
  last_updated TIMESTAMPTZ DEFAULT now(),
  last_analyzed_at TIMESTAMPTZ,
  source_files TEXT[],
  git_snapshot JSONB,
  staleness JSONB
);
CREATE INDEX idx_modules_project ON modules(project_id);

-- Full context documents (pre-generated llms.txt)
CREATE TABLE context_documents (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  full_context TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Full-text search indexes
CREATE INDEX idx_modules_fts ON modules USING GIN (to_tsvector('english', context));
CREATE INDEX idx_projects_fts ON projects USING GIN (to_tsvector('english', description));
