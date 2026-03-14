import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  getAllowedModels,
  getModel,
  getModelMultiplier,
  inferProvider,
  resolveModel,
  validateModelAccess,
} from "./catalog.js";

describe("getModel", () => {
  it("returns the model def for a known Claude ID", () => {
    const m = getModel("claude-haiku-4-5");
    expect(m).toBeDefined();
    expect(m?.provider).toBe("anthropic");
    expect(m?.multiplier).toBe(1);
  });

  it("returns the model def for a known OpenAI ID", () => {
    const m = getModel("gpt-5");
    expect(m).toBeDefined();
    expect(m?.provider).toBe("openai");
    expect(m?.multiplier).toBe(8);
  });

  it("returns undefined for an unknown ID", () => {
    expect(getModel("gpt-99")).toBeUndefined();
  });
});

describe("getModelMultiplier", () => {
  it("returns 1 for haiku", () => expect(getModelMultiplier("claude-haiku-4-5")).toBe(1));
  it("returns 3 for sonnet", () => expect(getModelMultiplier("claude-sonnet-4-6")).toBe(3));
  it("returns 15 for opus", () => expect(getModelMultiplier("claude-opus-4-6")).toBe(15));
  it("returns 0 for ollama models", () => expect(getModelMultiplier("ollama/llama3.2")).toBe(0));
  it("returns 1 for gpt-5-mini", () => expect(getModelMultiplier("gpt-5-mini")).toBe(1));
  it("returns 8 for gpt-5", () => expect(getModelMultiplier("gpt-5")).toBe(8));
  it("returns 20 for o3", () => expect(getModelMultiplier("o3")).toBe(20));
  it("returns 2 for unknown model (passthrough rate)", () =>
    expect(getModelMultiplier("unknown-future-model")).toBe(2));
});

describe("inferProvider", () => {
  it("infers anthropic for claude- prefix", () =>
    expect(inferProvider("claude-sonnet-4-6")).toBe("anthropic"));
  it("infers openai for gpt- prefix", () => expect(inferProvider("gpt-5")).toBe("openai"));
  it("infers openai for o3 prefix", () => expect(inferProvider("o3-pro")).toBe("openai"));
  it("infers openai for o4 prefix", () => expect(inferProvider("o4-mini")).toBe("openai"));
  it("infers ollama for ollama/ prefix", () =>
    expect(inferProvider("ollama/llama3.2")).toBe("ollama"));
  it("returns null for unknown prefix", () => expect(inferProvider("gemini-pro")).toBeNull());
});

describe("getAllowedModels", () => {
  it("access tier only gets local ollama models", () => {
    const allowed = getAllowedModels("access");
    expect(allowed.every((m) => m.isLocal)).toBe(true);
  });

  it("m1 tier can use haiku, gpt-5-mini, o4-mini, and ollama", () => {
    const ids = getAllowedModels("m1").map((m) => m.id);
    expect(ids).toContain("claude-haiku-4-5");
    expect(ids).toContain("gpt-5-mini");
    expect(ids).toContain("o4-mini");
    expect(ids).toContain("ollama/llama3.2");
    expect(ids).not.toContain("claude-sonnet-4-6");
    expect(ids).not.toContain("claude-opus-4-6");
  });

  it("m5 tier can use sonnet and gpt-5 but not opus or o3", () => {
    const ids = getAllowedModels("m5").map((m) => m.id);
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("gpt-5");
    expect(ids).not.toContain("claude-opus-4-6");
    expect(ids).not.toContain("o3");
  });

  it("m10 tier can use all models including opus and o3", () => {
    const ids = getAllowedModels("m10").map((m) => m.id);
    expect(ids).toContain("claude-opus-4-6");
    expect(ids).toContain("o3");
    expect(ids).toContain("o3-pro");
    expect(ids).toContain("gpt-5.4-pro");
  });
});

describe("validateModelAccess", () => {
  it("allows access tier to use ollama", () => {
    expect(validateModelAccess("access", "ollama/llama3.2").allowed).toBe(true);
  });

  it("denies access tier from using haiku", () => {
    const result = validateModelAccess("access", "claude-haiku-4-5");
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
    expect(validateModelAccess("m10", "claude-opus-4-6").allowed).toBe(true);
  });

  it("allows m1 tier to use gpt-5-mini", () => {
    expect(validateModelAccess("m1", "gpt-5-mini").allowed).toBe(true);
  });

  it("allows m5 tier to use gpt-5", () => {
    expect(validateModelAccess("m5", "gpt-5").allowed).toBe(true);
  });

  it("allows m1+ passthrough for unknown claude model", () => {
    const result = validateModelAccess("m1", "claude-future-model-9");
    expect(result.allowed).toBe(true);
    expect(result.passthrough).toBe(true);
  });

  it("allows m1+ passthrough for unknown gpt model", () => {
    const result = validateModelAccess("m1", "gpt-6");
    expect(result.allowed).toBe(true);
    expect(result.passthrough).toBe(true);
  });

  it("denies access tier passthrough", () => {
    const result = validateModelAccess("access", "gpt-6");
    expect(result.allowed).toBe(false);
  });

  it("denies unknown prefix with no inferred provider", () => {
    const result = validateModelAccess("enterprise", "gemini-pro");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Unknown model/);
  });
});

describe("resolveModel", () => {
  it("returns the requested model if allowed", () => {
    expect(resolveModel("m5", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("falls back to tier default if requested model is denied", () => {
    expect(resolveModel("m1", "claude-opus-4-6")).toBe(DEFAULT_MODEL.m1);
  });

  it("returns tier default when no model is requested", () => {
    expect(resolveModel("access")).toBe("ollama/llama3.2");
    expect(resolveModel("m1")).toBe("claude-haiku-4-5");
    expect(resolveModel("m5")).toBe("claude-sonnet-4-6");
    expect(resolveModel("m10")).toBe("claude-opus-4-6");
  });
});
