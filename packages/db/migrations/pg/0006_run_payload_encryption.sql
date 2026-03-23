-- Add IV columns for agent run payload encryption (AES-256-GCM)
-- When *_iv is set, the corresponding jsonb column contains a hex-encoded ciphertext string.
-- Existing rows have null IVs and remain readable as plain JSON (backward compatible).

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS input_payload_iv  text,
  ADD COLUMN IF NOT EXISTS output_payload_iv text;
