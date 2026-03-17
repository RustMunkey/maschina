-- 0003_schema_fixes.sql
-- Columns added to existing tables after initial migration.
-- All statements are idempotent (IF NOT EXISTS / safe ALTER).

-- agent_runs: model column (used by daemon watchdog and analyze phase)
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '';

-- agents: reputation + run counters (used by scheduler scoring)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT '1.0.0';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_runs_completed integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_runs_failed integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS reputation_score numeric(5,2) NOT NULL DEFAULT 50;

-- node_heartbeats: active_task_count must be bigint to match Rust i64
ALTER TABLE node_heartbeats ALTER COLUMN active_task_count TYPE bigint;

-- agent_skills: per-agent skill configuration (resolved by daemon EVALUATE phase)
CREATE TABLE IF NOT EXISTS agent_skills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_name text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}',
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_agent_skill_uniq ON agent_skills(agent_id, skill_name);
CREATE INDEX IF NOT EXISTS agent_skills_agent_id_idx ON agent_skills(agent_id);

-- agent_permissions: skill → permission gates (checked by daemon before execution)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_permission') THEN
        CREATE TYPE agent_permission AS ENUM ('code_execution', 'internet_access', 'file_system', 'external_api');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    permission agent_permission NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_permissions_agent_perm_uniq ON agent_permissions(agent_id, permission);
CREATE INDEX IF NOT EXISTS agent_permissions_agent_id_idx ON agent_permissions(agent_id);
