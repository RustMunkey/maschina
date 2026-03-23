-- 0005_otp_device_codes.sql
-- Passwordless auth tables: OTP codes (magic link) + device codes (CLI device flow).

-- otp_codes: keyed on emailIndex (HMAC of email) so it works pre-signup when userId doesn't exist yet.
CREATE TABLE IF NOT EXISTS otp_codes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_index text    NOT NULL,                              -- HMAC-SHA256(email, JWT_SECRET)
    code_hash   text    NOT NULL,                              -- SHA-256 of 6-digit code
    attempts    integer NOT NULL DEFAULT 0,                    -- max 5
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_email_index_idx ON otp_codes (email_index);
CREATE INDEX IF NOT EXISTS otp_expires_at_idx  ON otp_codes (expires_at);

-- device_codes: OAuth 2.0 Device Authorization Flow for the CLI.
-- CLI gets deviceCode + userCode, polls /auth/device/token until user confirms at /device.
CREATE TABLE IF NOT EXISTS device_codes (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code_hash  text        NOT NULL UNIQUE,             -- SHA-256 of opaque code sent to CLI
    user_code         text        NOT NULL UNIQUE,             -- short code user types (e.g. "WXYZ-1234")
    user_id           uuid        REFERENCES users(id) ON DELETE CASCADE,  -- set on confirm
    scopes            text        NOT NULL DEFAULT 'cli',
    expires_at        timestamptz NOT NULL,
    confirmed_at      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_code_hash_idx  ON device_codes (device_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS device_user_code_idx  ON device_codes (user_code);
CREATE INDEX        IF NOT EXISTS device_expires_at_idx ON device_codes (expires_at);
