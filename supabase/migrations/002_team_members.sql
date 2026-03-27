-- Team members: developers who connect via MCP with their own API key
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_members_org ON members(org_id);

-- Link API keys to members (nullable = admin key with full org access)
ALTER TABLE api_keys ADD COLUMN member_id UUID REFERENCES members(id) ON DELETE SET NULL;

-- Per-project access control: members only see explicitly assigned projects
CREATE TABLE member_project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, project_id)
);
CREATE INDEX idx_mpa_member ON member_project_access(member_id);
CREATE INDEX idx_mpa_project ON member_project_access(project_id);
