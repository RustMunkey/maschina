export interface FlagContext {
  userId?: string;
  orgId?: string;
  tier?: string;
  email?: string;
  /** Arbitrary key/value attributes for targeting rules */
  attributes?: Record<string, string | number | boolean>;
}

export interface FlagValue {
  enabled: boolean;
  /** Optional variant for A/B tests */
  variant?: string;
  /** Raw payload from LaunchDarkly or fallback */
  payload?: unknown;
}

export type FlagKey = string;
