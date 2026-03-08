import type { PlanTier } from "@maschina/plans";

// ─── Model definitions ────────────────────────────────────────────────────────
// multiplier: tokens billed = actual_tokens * multiplier
//   Ollama (local) = 0 — never deducted from quota
//   Haiku           = 1 — 1:1 deduction
//   Sonnet          = 3 — 3x deduction per token
//   Opus            = 15 — 15x deduction per token
//
// minTier: minimum plan tier required to use this model via cloud execution.
// Local Ollama models have minTier "access" (always allowed).

export interface ModelDef {
  id: string;
  displayName: string;
  provider: "anthropic" | "ollama";
  /** Token billing multiplier. 0 = no deduction (local). */
  multiplier: number;
  /** Minimum tier for cloud access. */
  minTier: PlanTier;
  /** Whether this is a local Ollama model. */
  isLocal: boolean;
}

export const MODEL_CATALOG: ModelDef[] = [
  // ─── Anthropic cloud models ─────────────────────────────────────────────
  {
    id: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku",
    provider: "anthropic",
    multiplier: 1,
    minTier: "m1",
    isLocal: false,
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet",
    provider: "anthropic",
    multiplier: 3,
    minTier: "m5",
    isLocal: false,
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus",
    provider: "anthropic",
    multiplier: 15,
    minTier: "m10",
    isLocal: false,
  },

  // ─── Local Ollama models (Access tier and up) ────────────────────────────
  {
    id: "ollama/llama3.2",
    displayName: "Llama 3.2 (local)",
    provider: "ollama",
    multiplier: 0,
    minTier: "access",
    isLocal: true,
  },
  {
    id: "ollama/llama3.1",
    displayName: "Llama 3.1 (local)",
    provider: "ollama",
    multiplier: 0,
    minTier: "access",
    isLocal: true,
  },
  {
    id: "ollama/mistral",
    displayName: "Mistral (local)",
    provider: "ollama",
    multiplier: 0,
    minTier: "access",
    isLocal: true,
  },
];

const TIER_RANK: Record<PlanTier, number> = {
  access: 0,
  m1: 1,
  m5: 2,
  m10: 3,
  teams: 4,
  enterprise: 5,
  internal: 5,
};

/** Default model for a given plan tier. */
export const DEFAULT_MODEL: Record<PlanTier, string> = {
  access: "ollama/llama3.2",
  m1: "claude-haiku-4-5-20251001",
  m5: "claude-sonnet-4-6",
  m10: "claude-opus-4-6",
  teams: "claude-sonnet-4-6",
  enterprise: "claude-opus-4-6",
  internal: "claude-opus-4-6",
};

/** Returns all models accessible at or below the given tier. */
export function getAllowedModels(tier: PlanTier): ModelDef[] {
  return MODEL_CATALOG.filter((m) => TIER_RANK[tier] >= TIER_RANK[m.minTier]);
}

/** Returns the model definition by ID, or undefined if not found. */
export function getModel(modelId: string): ModelDef | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

/** Returns the billing multiplier for a model. Returns 1 if model not found. */
export function getModelMultiplier(modelId: string): number {
  return getModel(modelId)?.multiplier ?? 1;
}

export interface ModelAccessResult {
  allowed: boolean;
  reason?: string;
  model: ModelDef | undefined;
}

/**
 * Validates whether a given tier may use a given model.
 * Returns { allowed: true, model } on success.
 * Returns { allowed: false, reason } if denied.
 */
export function validateModelAccess(tier: PlanTier, modelId: string): ModelAccessResult {
  const model = getModel(modelId);
  if (!model) {
    return { allowed: false, reason: `Unknown model: ${modelId}`, model: undefined };
  }
  if (TIER_RANK[tier] < TIER_RANK[model.minTier]) {
    return {
      allowed: false,
      reason: `Model ${model.displayName} requires the ${model.minTier} plan or higher.`,
      model,
    };
  }
  return { allowed: true, model };
}

/** Returns the default model ID for a tier, resolving to the best allowed model. */
export function resolveModel(tier: PlanTier, requested?: string): string {
  if (requested) {
    const { allowed } = validateModelAccess(tier, requested);
    if (allowed) return requested;
  }
  return DEFAULT_MODEL[tier];
}
