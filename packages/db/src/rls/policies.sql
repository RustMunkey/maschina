-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security Policies
-- Applied to the maschina_app database role only.
-- Run via migration — not via application code.
-- ─────────────────────────────────────────────────────────────────────────────

-- Create application roles
CREATE ROLE maschina_app;
CREATE ROLE maschina_readonly;
CREATE ROLE maschina_migrate;

-- maschina_migrate gets DDL rights (used only by migration runner)
GRANT ALL ON SCHEMA public TO maschina_migrate;

-- maschina_app gets DML only on specific tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO maschina_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO maschina_app;

-- maschina_readonly for analytics / reporting queries
GRANT SELECT ON ALL TABLES IN SCHEMA public TO maschina_readonly;

-- ─── Enable RLS on all user-scoped tables ────────────────────────────────────
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_passwords          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_rollups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE files                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_addresses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_consent        ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_requests    ENABLE ROW LEVEL SECURITY;

-- ─── Policies: users can only see/modify their own rows ───────────────────────
-- The app sets a session variable: SET LOCAL app.current_user_id = '<uuid>';

CREATE POLICY user_isolation ON users
  USING (id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY session_isolation ON sessions
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY oauth_isolation ON oauth_accounts
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY api_key_isolation ON api_keys
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY usage_isolation ON usage_events
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY agent_isolation ON agents
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY agent_run_isolation ON agent_runs
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY notification_isolation ON notifications
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY file_isolation ON files
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY consent_isolation ON consent_records
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY training_consent_isolation ON training_consent
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Audit logs: users can read their own, never write via app (append-only via trigger)
CREATE POLICY audit_read_isolation ON audit_logs FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- ─── Bypass RLS for service role (migrations, internal jobs) ─────────────────
ALTER TABLE users               FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions            FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys            FORCE ROW LEVEL SECURITY;
ALTER TABLE agents              FORCE ROW LEVEL SECURITY;

-- maschina_migrate bypasses RLS (superuser-equivalent for schema ops)
ALTER ROLE maschina_migrate BYPASSRLS;
