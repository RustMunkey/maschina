import type { PlanTier } from "@maschina/plans";

// ─── Model definitions ────────────────────────────────────────────────────────
// multiplier: tokens billed = actual_tokens * multiplier
//   0  = free (local Ollama — never deducted from quota)
//   1  = 1:1 (cheap/fast models)
//   3  = 3x  (mid-tier)
//   8+ = expensive/frontier models
//
// minTier: minimum plan tier required to use this model via cloud execution.
// Passthrough models (unknown IDs) route by prefix with a flat 2x multiplier.

export interface ModelDef {
  id: string;
  displayName: string;
  provider: "anthropic" | "openai" | "ollama";
  /** Token billing multiplier. 0 = no deduction (local). */
  multiplier: number;
  /** Minimum tier for cloud access. */
  minTier: PlanTier;
  /** Whether this is a local Ollama model. */
  isLocal: boolean;
  /** Whether this model is deprecated (still works, but warn users). */
  deprecated?: boolean;
}

export const MODEL_CATALOG: ModelDef[] = [
  // ─── Anthropic — Claude 4.x (current) ──────────────────────────────────
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    provider: "anthropic",
    multiplier: 1,
    minTier: "m1",
    isLocal: false,
  },
  {
    id: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5 (pinned)",
    provider: "anthropic",
    multiplier: 1,
    minTier: "m1",
    isLocal: false,
  },
  {
    id: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    provider: "anthropic",
    multiplier: 3,
    minTier: "m5",
    isLocal: false,
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    provider: "anthropic",
    multiplier: 3,
    minTier: "m5",
    isLocal: false,
  },
  {
    id: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    provider: "anthropic",
    multiplier: 15,
    minTier: "m10",
    isLocal: false,
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    provider: "anthropic",
    multiplier: 15,
    minTier: "m10",
    isLocal: false,
  },

  // ─── Anthropic — Claude 4.x legacy (available, not recommended) ─────────
  {
    id: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4 (legacy)",
    provider: "anthropic",
    multiplier: 3,
    minTier: "m5",
    isLocal: false,
    deprecated: true,
  },
  {
    id: "claude-opus-4-20250514",
    displayName: "Claude Opus 4 (legacy)",
    provider: "anthropic",
    multiplier: 15,
    minTier: "m10",
    isLocal: false,
    deprecated: true,
  },

  // ─── OpenAI — GPT-5 series (current) ────────────────────────────────────
  {
    id: "gpt-5-nano",
    displayName: "GPT-5 Nano",
    provider: "openai",
    multiplier: 1,
    minTier: "m1",
    isLocal: false,
  },
  {
    id: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    provider: "openai",
    multiplier: 1,
    minTier: "m1",
    isLocal: false,
  },
  {
    id: "gpt-5",
    displayName: "GPT-5",
    provider: "openai",
    multiplier: 8,
    minTier: "m5",
    isLocal: false,
  },
  {
    id: "gpt-5.4",
    displayName: "GPT-5.4",
    provider: "openai",
    multiplier: 10,
    minTier: "m5",
    isLocal: false,
  },
  {
    id: "gpt-5.4-pro",
    displayName: "GPT-5.4 Pro",
    provider: "openai",
    multiplier: 25,
    minTier: "m10",
    isLocal: false,
  },

  // ─── OpenAI — o-series reasoning models ─────────────────────────────────
  {
    id: "o4-mini",
    displayName: "o4-mini",
    provider: "openai",
    multiplier: 2,
    minTier: "m1",
    isLocal: false,
  },
  {
    id: "o3-mini",
    displayName: "o3-mini",
    provider: "openai",
    multiplier: 2,
    minTier: "m1",
    isLocal: false,
  },
  {
    id: "o3",
    displayName: "o3",
    provider: "openai",
    multiplier: 20,
    minTier: "m10",
    isLocal: false,
  },
  {
    id: "o3-pro",
    displayName: "o3 Pro",
    provider: "openai",
    multiplier: 25,
    minTier: "m10",
    isLocal: false,
  },

  // ─── OpenAI — GPT-4.1 series (legacy, still available) ──────────────────
  {
    id: "gpt-4.1-mini",
    displayName: "GPT-4.1 Mini (legacy)",
    provider: "openai",
    multiplier: 1,
    minTier: "m1",
    isLocal: false,
    deprecated: true,
  },
  {
    id: "gpt-4.1",
    displayName: "GPT-4.1 (legacy)",
    provider: "openai",
    multiplier: 4,
    minTier: "m5",
    isLocal: false,
    deprecated: true,
  },
  {
    id: "gpt-4o",
    displayName: "GPT-4o (legacy)",
    provider: "openai",
    multiplier: 4,
    minTier: "m5",
    isLocal: false,
    deprecated: true,
  },
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini (legacy)",
    provider: "openai",
    multiplier: 1,
    minTier: "m1",
    isLocal: false,
    deprecated: true,
  },

  // ─── Local Ollama models (Access tier and up, always free) ──────────────
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
  m1: "claude-haiku-4-5",
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

/** Returns the billing multiplier for a model. Returns 2 for unknown (passthrough). */
export function getModelMultiplier(modelId: string): number {
  return getModel(modelId)?.multiplier ?? 2;
}

/**
 * Infer the provider from a model ID prefix.
 * Used for passthrough routing of models not in the catalog.
 */
export function inferProvider(modelId: string): "anthropic" | "openai" | "ollama" | null {
  if (modelId.startsWith("ollama/")) return "ollama";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (
    modelId.startsWith("gpt-") ||
    modelId.startsWith("o1") ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4")
  )
    return "openai";
  return null;
}

export interface ModelAccessResult {
  allowed: boolean;
  reason?: string;
  model: ModelDef | undefined;
  /** True if this is a passthrough (model not in catalog but provider inferred). */
  passthrough?: boolean;
}

/**
 * Validates whether a given tier may use a given model.
 * If the model is not in the catalog but has a recognizable prefix,
 * allows it as a passthrough at M1+ (with a flat 2x multiplier).
 */
export function validateModelAccess(tier: PlanTier, modelId: string): ModelAccessResult {
  const model = getModel(modelId);

  if (model) {
    if (TIER_RANK[tier] < TIER_RANK[model.minTier]) {
      return {
        allowed: false,
        reason: `Model ${model.displayName} requires the ${model.minTier} plan or higher.`,
        model,
      };
    }
    return { allowed: true, model };
  }

  // Not in catalog — try passthrough by prefix
  const provider = inferProvider(modelId);
  if (provider === "ollama") {
    // Any ollama/* model is allowed at all tiers — local, always free
    return { allowed: true, model: undefined, passthrough: true };
  }
  if (provider) {
    // Non-ollama passthrough requires at least M1
    if (TIER_RANK[tier] < TIER_RANK.m1) {
      return {
        allowed: false,
        reason: "Custom models require the M1 plan or higher.",
        model: undefined,
      };
    }
    return { allowed: true, model: undefined, passthrough: true };
  }

  return { allowed: false, reason: `Unknown model: ${modelId}`, model: undefined };
}

/** Returns the default model ID for a tier, resolving to the best allowed model. */
export function resolveModel(tier: PlanTier, requested?: string): string {
  if (requested) {
    const { allowed } = validateModelAccess(tier, requested);
    if (allowed) return requested;
  }
  return DEFAULT_MODEL[tier];
}
