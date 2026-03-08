import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  getAllowedModels,
  getModel,
  getModelMultiplier,
  resolveModel,
  validateModelAccess,
} from "./catalog.js";

describe("getModel", () => {
  it("returns the model def for a known ID", () => {
    const m = getModel("claude-haiku-4-5-20251001");
    expect(m).toBeDefined();
    expect(m?.provider).toBe("anthropic");
    expect(m?.multiplier).toBe(1);
  });

  it("returns undefined for an unknown ID", () => {
    expect(getModel("gpt-99")).toBeUndefined();
  });
});

describe("getModelMultiplier", () => {
  it("returns 1 for haiku", () => expect(getModelMultiplier("claude-haiku-4-5-20251001")).toBe(1));
  it("returns 3 for sonnet", () => expect(getModelMultiplier("claude-sonnet-4-6")).toBe(3));
  it("returns 15 for opus", () => expect(getModelMultiplier("claude-opus-4-6")).toBe(15));
  it("returns 0 for ollama models", () => expect(getModelMultiplier("ollama/llama3.2")).toBe(0));
  it("returns 1 for unknown model (safe default)", () =>
    expect(getModelMultiplier("unknown")).toBe(1));
});

describe("getAllowedModels", () => {
  it("access tier only gets local ollama models", () => {
    const allowed = getAllowedModels("access");
    expect(allowed.every((m) => m.isLocal)).toBe(true);
  });

  it("m1 tier can use haiku and ollama", () => {
    const ids = getAllowedModels("m1").map((m) => m.id);
    expect(ids).toContain("claude-haiku-4-5-20251001");
    expect(ids).toContain("ollama/llama3.2");
    expect(ids).not.toContain("claude-sonnet-4-6");
    expect(ids).not.toContain("claude-opus-4-6");
  });

  it("m5 tier can use haiku and sonnet but not opus", () => {
    const ids = getAllowedModels("m5").map((m) => m.id);
    expect(ids).toContain("claude-haiku-4-5-20251001");
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).not.toContain("claude-opus-4-6");
  });

  it("m10 tier can use all models", () => {
    const ids = getAllowedModels("m10").map((m) => m.id);
    expect(ids).toContain("claude-haiku-4-5-20251001");
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("claude-opus-4-6");
  });

  it("internal tier can use all models", () => {
    const ids = getAllowedModels("internal").map((m) => m.id);
    expect(ids).toContain("claude-opus-4-6");
  });
});

describe("validateModelAccess", () => {
  it("allows access tier to use ollama", () => {
    const result = validateModelAccess("access", "ollama/llama3.2");
    expect(result.allowed).toBe(true);
  });

  it("denies access tier from using haiku", () => {
    const result = validateModelAccess("access", "claude-haiku-4-5-20251001");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/m1/);
  });

  it("denies m1 tier from using sonnet", () => {
    const result = validateModelAccess("m1", "claude-sonnet-4-6");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/m5/);
  });

  it("denies m5 tier from using opus", () => {
    const result = validateModelAccess("m5", "claude-opus-4-6");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/m10/);
  });

  it("allows m10 tier to use opus", () => {
    const result = validateModelAccess("m10", "claude-opus-4-6");
    expect(result.allowed).toBe(true);
  });

  it("denies unknown model with clear error", () => {
    const result = validateModelAccess("enterprise", "gpt-99");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Unknown model/);
  });
});

describe("resolveModel", () => {
  it("returns the requested model if allowed", () => {
    expect(resolveModel("m5", "claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
  });

  it("falls back to tier default if requested model is denied", () => {
    // m1 requesting opus → should fall back to m1 default
    expect(resolveModel("m1", "claude-opus-4-6")).toBe(DEFAULT_MODEL.m1);
  });

  it("returns tier default when no model is requested", () => {
    expect(resolveModel("access")).toBe("ollama/llama3.2");
    expect(resolveModel("m1")).toBe("claude-haiku-4-5-20251001");
    expect(resolveModel("m5")).toBe("claude-sonnet-4-6");
    expect(resolveModel("m10")).toBe("claude-opus-4-6");
  });
});
