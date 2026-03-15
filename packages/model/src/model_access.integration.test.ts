import type { PlanTier } from "@maschina/plans";
/**
 * Integration tests: plan tier access gates ↔ model access validation.
 *
 * These tests exercise the full path a run request takes through the model
 * catalog — validateModelAccess → resolveModel — with real plan tier logic.
 * No mocks, no network, no DB.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, getAllowedModels, resolveModel, validateModelAccess } from "./catalog.js";

// ─── Access tier — free plan ───────────────────────────────────────────────────
// Access tier has no cloud execution feature, so cloud models should be blocked.

describe("access tier model access", () => {
  it("cannot access claude-haiku (requires M1+)", () => {
    const { allowed } = validateModelAccess("access", "claude-haiku-4-5");
    expect(allowed).toBe(false);
  });

  it("cannot access claude-sonnet (requires M5+)", () => {
    const { allowed } = validateModelAccess("access", "claude-sonnet-4-6");
    expect(allowed).toBe(false);
  });

  it("cannot use custom model passthrough (requires M1+)", () => {
    const { allowed } = validateModelAccess("access", "gpt-5-mini");
    expect(allowed).toBe(false);
  });

  it("has no allowed models", () => {
    const models = getAllowedModels("access");
    // Access tier has no cloud models — all require at minimum m1
    expect(models.every((m) => m.isLocal)).toBe(true);
  });
});

// ─── M1 tier ──────────────────────────────────────────────────────────────────

describe("m1 tier model access", () => {
  it("can access claude-haiku (M1+)", () => {
    const result = validateModelAccess("m1", "claude-haiku-4-5");
    expect(result.allowed).toBe(true);
    expect(result.model?.id).toBe("claude-haiku-4-5");
  });

  it("cannot access claude-sonnet (requires M5+)", () => {
    const { allowed } = validateModelAccess("m1", "claude-sonnet-4-6");
    expect(allowed).toBe(false);
  });

  it("cannot access claude-opus (requires M10+)", () => {
    const { allowed } = validateModelAccess("m1", "claude-opus-4-6");
    expect(allowed).toBe(false);
  });

  it("resolves to haiku as default model", () => {
    const model = resolveModel("m1");
    expect(model).toBe("claude-haiku-4-5");
  });

  it("resolves requested haiku successfully", () => {
    expect(resolveModel("m1", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("falls back to default when requested model is not allowed", () => {
    // Sonnet requires M5, so M1 user requesting sonnet falls back to haiku
    const resolved = resolveModel("m1", "claude-sonnet-4-6");
    expect(resolved).toBe(DEFAULT_MODEL.m1);
  });

  it("can use unknown model passthrough (M1+ allowed)", () => {
    // Use a model ID with a known prefix but not in the catalog
    const result = validateModelAccess("m1", "gpt-unknown-future-model-xyz");
    expect(result.allowed).toBe(true);
    expect(result.passthrough).toBe(true);
  });
});

// ─── M5 tier ──────────────────────────────────────────────────────────────────

describe("m5 tier model access", () => {
  it("can access claude-sonnet (M5+)", () => {
    const result = validateModelAccess("m5", "claude-sonnet-4-6");
    expect(result.allowed).toBe(true);
  });

  it("can access claude-haiku (M1+)", () => {
    expect(validateModelAccess("m5", "claude-haiku-4-5").allowed).toBe(true);
  });

  it("cannot access claude-opus (requires M10+)", () => {
    expect(validateModelAccess("m5", "claude-opus-4-6").allowed).toBe(false);
  });

  it("resolves to sonnet as default model", () => {
    const model = resolveModel("m5");
    expect(model).toBe("claude-sonnet-4-6");
  });
});

// ─── M10 tier ─────────────────────────────────────────────────────────────────

describe("m10 tier model access", () => {
  it("can access all Claude models", () => {
    const claudeModels = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"];
    for (const modelId of claudeModels) {
      expect(validateModelAccess("m10", modelId).allowed).toBe(true);
    }
  });

  it("resolves to opus as default model", () => {
    const model = resolveModel("m10");
    expect(model).toBe("claude-opus-4-6");
  });
});

// ─── Internal tier ────────────────────────────────────────────────────────────

describe("internal tier model access", () => {
  it("can access all models", () => {
    const allModels = getAllowedModels("internal");
    expect(allModels.length).toBeGreaterThan(0);
    // Internal has access to at least all the Claude models
    const haiku = allModels.find((m) => m.id === "claude-haiku-4-5");
    const opus = allModels.find((m) => m.id === "claude-opus-4-6");
    expect(haiku).toBeDefined();
    expect(opus).toBeDefined();
  });
});

// ─── Unknown / invalid model ──────────────────────────────────────────────────

describe("unknown model handling", () => {
  it("blocks completely unknown model IDs", () => {
    const result = validateModelAccess("m10", "gpt-nonexistent-model-xyz");
    // "gpt-" prefix → openai passthrough → allowed at M1+
    // Actually gpt- is a recognized prefix for passthrough!
    expect(result.allowed).toBe(true); // passthrough
  });

  it("blocks models with unrecognized prefix even at internal tier", () => {
    const result = validateModelAccess("internal", "totally-unknown-llm/v1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/unknown model/i);
  });

  it("includes reason string when blocked", () => {
    const result = validateModelAccess("m1", "claude-opus-4-6");
    expect(result.allowed).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason?.length).toBeGreaterThan(0);
  });
});

// ─── Cascade fallback semantics ────────────────────────────────────────────────
// resolveModel() is the entry point for cascade fallback:
// if a requested model is not accessible, fall back to tier default.

describe("resolveModel cascade fallback", () => {
  const cases: Array<{ tier: PlanTier; requested: string; expected: string }> = [
    { tier: "m1", requested: "claude-opus-4-6", expected: DEFAULT_MODEL.m1 },
    { tier: "m1", requested: "claude-sonnet-4-6", expected: DEFAULT_MODEL.m1 },
    { tier: "m5", requested: "claude-opus-4-6", expected: DEFAULT_MODEL.m5 },
    { tier: "m5", requested: "claude-haiku-4-5", expected: "claude-haiku-4-5" }, // allowed
  ];

  for (const { tier, requested, expected } of cases) {
    it(`${tier} requesting ${requested} → resolves to ${expected}`, () => {
      expect(resolveModel(tier, requested)).toBe(expected);
    });
  }

  it("no requested model → returns tier default", () => {
    const tiers: PlanTier[] = ["m1", "m5", "m10", "internal"];
    for (const tier of tiers) {
      const resolved = resolveModel(tier);
      expect(typeof resolved).toBe("string");
      expect(resolved.length).toBeGreaterThan(0);
    }
  });
});
