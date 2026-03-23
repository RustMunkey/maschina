-- 0001_otp_device_codes.sql
-- Passwordless auth tables: OTP codes (magic link) + device codes (CLI device flow).

CREATE TABLE IF NOT EXISTS otp_codes (
    id          text    PRIMARY KEY,
    email_index text    NOT NULL,
    code_hash   text    NOT NULL,
    attempts    integer NOT NULL DEFAULT 0,
    expires_at  integer NOT NULL,
    used_at     integer,
    created_at  integer NOT NULL
);

CREATE INDEX IF NOT EXISTS otp_email_index_idx ON otp_codes (email_index);
CREATE INDEX IF NOT EXISTS otp_expires_at_idx  ON otp_codes (expires_at);

CREATE TABLE IF NOT EXISTS device_codes (
    id                text    PRIMARY KEY,
    device_code_hash  text    NOT NULL UNIQUE,
    user_code         text    NOT NULL UNIQUE,
    user_id           text    REFERENCES users(id) ON DELETE CASCADE,
    scopes            text    NOT NULL DEFAULT 'cli',
    expires_at        integer NOT NULL,
    confirmed_at      integer,
    created_at        integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS device_code_hash_idx  ON device_codes (device_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS device_user_code_idx  ON device_codes (user_code);
CREATE INDEX        IF NOT EXISTS device_expires_at_idx ON device_codes (expires_at);
