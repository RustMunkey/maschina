-- 0004_push_tokens.sql
-- Push notification device tokens + alerts table

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'push_platform') THEN
    CREATE TYPE push_platform AS ENUM ('apns', 'fcm', 'webpush');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'error', 'critical');
  END IF;
END $$;

-- ── push_tokens ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      push_platform NOT NULL,
  subscription  JSONB       NOT NULL,
  device_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx          ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS push_tokens_user_platform_idx ON push_tokens(user_id, platform);

-- ── alerts ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  severity        alert_severity NOT NULL DEFAULT 'info',
  type            notification_type NOT NULL,
  title           TEXT          NOT NULL,
  message         TEXT          NOT NULL,
  data            JSONB,
  action_url      TEXT,
  acknowledged    BOOLEAN       NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS alerts_user_active_idx ON alerts(user_id, acknowledged);
CREATE INDEX IF NOT EXISTS alerts_created_at_idx  ON alerts(created_at);
