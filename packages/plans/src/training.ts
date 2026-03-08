// ─── Training consent and data collection policy ──────────────────────────────
// Legal basis: explicit opt-in consent (GDPR Art. 6(1)(a), CCPA).
// Users must actively consent — no pre-ticked boxes, no dark patterns.

export const TRAINING_POLICY_VERSION = "1.0.0";

// The minimum consent text that must be shown to users.
// Legal approved — do not modify without legal review.
export const TRAINING_CONSENT_TEXT = `
By enabling this setting, you agree to allow Maschina to use your anonymized
interaction data (agent prompts, outputs, and corrections) to improve Maschina's
AI models. Your data is anonymized before use — personal information is removed.
You can withdraw consent at any time in Settings → Privacy, and your data will
be excluded from future training runs. This does not affect past training runs
already completed.
`.trim();

// Jurisdictions we explicitly handle
export const SUPPORTED_JURISDICTIONS = ["EU", "UK", "US-CA", "CA", "BR", "AU"] as const;
export type Jurisdiction = (typeof SUPPORTED_JURISDICTIONS)[number];

// Default consent by plan tier:
// Free tier: opted IN by default (user can opt out) — mirrors Cursor/ChatGPT free tier
// Paid tiers: opted OUT by default (user can opt in) — respects paying customers' expectation of privacy
export const DEFAULT_TRAINING_CONSENT: Record<string, boolean> = {
  access:     true,   // free tier: opted in by default (can opt out)
  m1:         false,
  m5:         false,
  m10:        false,
  teams:      false,
  enterprise: false,
  internal:   false,  // team never contributes training data
};

// ─── What data is eligible for training ───────────────────────────────────────

export interface TrainingDataConfig {
  /** Include agent task prompts and outputs */
  includeAgentRuns: boolean;
  /** Include chat messages with Maschina model */
  includeModelChats: boolean;
  /** Include user corrections and edits to agent outputs (highest signal) */
  includeCorrections: boolean;
  /** Include API call patterns (no content, just structure) */
  includeApiPatterns: boolean;
}

// What gets collected per tier when consent is given
export const TRAINING_DATA_SCOPE: Record<string, TrainingDataConfig> = {
  free: {
    includeAgentRuns:    true,
    includeModelChats:   false,  // free tier doesn't use Maschina model
    includeCorrections:  true,
    includeApiPatterns:  false,  // free tier has no API keys
  },
  operator: {
    includeAgentRuns:    true,
    includeModelChats:   true,
    includeCorrections:  true,
    includeApiPatterns:  true,
  },
  pro: {
    includeAgentRuns:    true,
    includeModelChats:   true,
    includeCorrections:  true,
    includeApiPatterns:  true,
  },
  enterprise: {
    // Enterprise gets individually negotiated data agreements — all off by default
    includeAgentRuns:    false,
    includeModelChats:   false,
    includeCorrections:  false,
    includeApiPatterns:  false,
  },
};

// ─── PII categories that must be stripped before training ─────────────────────

export const PII_CATEGORIES = [
  "email_address",
  "phone_number",
  "full_name",
  "physical_address",
  "ip_address",
  "credit_card",
  "social_security_number",
  "passport_number",
  "date_of_birth",
  "financial_account",
] as const;

export type PiiCategory = (typeof PII_CATEGORIES)[number];

// ─── Data retention for training data ────────────────────────────────────────
// Raw interaction data is kept for this long before being purged from primary DB.
// Anonymized training data in the ML pipeline has a separate retention policy.

export const TRAINING_DATA_RETENTION_DAYS = 365 * 2; // 2 years raw, then purge or anonymize
