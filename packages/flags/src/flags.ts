/**
 * Flag definitions — single source of truth for all feature flags.
 *
 * Add new flags here. The key is what you use in code; the defaultValue is
 * the fallback when LaunchDarkly is unavailable or the flag doesn't exist.
 */

export const FLAGS = {
  // ── Platform features ────────────────────────────────────────────────────
  /** Enable the agent marketplace for this user */
  marketplaceEnabled: { defaultValue: true },
  /** Enable the multi-agent workflow builder */
  workflowsEnabled: { defaultValue: true },
  /** Enable agent episodic memory */
  memoryEnabled: { defaultValue: false },
  /** Enable Proof of Compute execution receipts */
  proofOfComputeEnabled: { defaultValue: false },

  // ── Node network ─────────────────────────────────────────────────────────
  /** Allow users to register their device as a compute node */
  nodeRegistrationEnabled: { defaultValue: false },
  /** Enable distributed compute routing (vs. local runtime) */
  distributedComputeEnabled: { defaultValue: false },

  // ── Billing / plans ──────────────────────────────────────────────────────
  /** Show the Mach Team plan in pricing */
  machTeamPlanVisible: { defaultValue: true },
  /** Enable Stripe billing (disable for internal/test accounts) */
  billingEnabled: { defaultValue: true },

  // ── Developer features ───────────────────────────────────────────────────
  /** Enable the agent skill marketplace */
  skillMarketplaceEnabled: { defaultValue: false },
  /** Enable the plugin/extension system */
  pluginsEnabled: { defaultValue: false },

  // ── Rollouts ─────────────────────────────────────────────────────────────
  /** New agent run UI (gradual rollout) */
  newRunUiEnabled: { defaultValue: false },
} as const satisfies Record<string, { defaultValue: boolean }>;

export type FlagName = keyof typeof FLAGS;
