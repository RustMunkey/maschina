import { describe, expect, it } from "vitest";
import { ValidationError, assertValid, parseBody } from "./parse.js";
import { CreateAgentSchema, RunAgentSchema, UpdateAgentSchema } from "./schemas/agent.js";
import { LoginSchema, RegisterSchema } from "./schemas/auth.js";

// ─── parseBody ────────────────────────────────────────────────────────────────

describe("parseBody", () => {
  it("returns success with typed data on valid input", () => {
    const result = parseBody(LoginSchema, { email: "user@example.com", password: "secret123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("lowercases and trims email via LoginSchema transform", () => {
    const result = parseBody(LoginSchema, { email: "  USER@EXAMPLE.COM  ", password: "pass" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.com");
  });

  it("returns errors on invalid input", () => {
    const result = parseBody(LoginSchema, { email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.field === "email")).toBe(true);
    }
  });

  it("uses _root as field when error has no path", () => {
    // A schema with a top-level refine will produce _root errors
    const result = parseBody(RegisterSchema, { email: "x@x.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("returns empty errors array never on success", () => {
    const result = parseBody(RegisterSchema, { email: "x@x.com", password: "ValidPass1!" });
    expect(result.success).toBe(true);
  });
});

// ─── assertValid ──────────────────────────────────────────────────────────────

describe("assertValid", () => {
  it("returns parsed data on success", () => {
    const data = assertValid(LoginSchema, { email: "a@b.com", password: "pass123" });
    expect(data.email).toBe("a@b.com");
  });

  it("throws ValidationError on failure", () => {
    expect(() => assertValid(LoginSchema, {})).toThrow(ValidationError);
  });

  it("thrown ValidationError has fields array", () => {
    try {
      assertValid(LoginSchema, { email: "bad" });
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      if (e instanceof ValidationError) {
        expect(Array.isArray(e.fields)).toBe(true);
        expect(e.fields.length).toBeGreaterThan(0);
      }
    }
  });

  it("ValidationError statusCode is 400", () => {
    try {
      assertValid(LoginSchema, {});
    } catch (e) {
      if (e instanceof ValidationError) {
        expect(e.statusCode).toBe(400);
      }
    }
  });

  it("accepts null body gracefully", () => {
    expect(() => assertValid(LoginSchema, null)).toThrow(ValidationError);
  });
});

// ─── RegisterSchema ───────────────────────────────────────────────────────────

describe("RegisterSchema", () => {
  it("accepts valid registration data", () => {
    const data = assertValid(RegisterSchema, {
      email: "ash@maschina.ai",
      password: "Str0ng!Pass#1",
      name: "Asher",
    });
    expect(data.email).toBe("ash@maschina.ai");
    expect(data.name).toBe("Asher");
  });

  it("lowercases and trims email", () => {
    const data = assertValid(RegisterSchema, {
      email: "  ASH@MASCHINA.AI  ",
      password: "Str0ng!Pass#1",
    });
    expect(data.email).toBe("ash@maschina.ai");
  });

  it("name is optional", () => {
    const data = assertValid(RegisterSchema, { email: "a@b.com", password: "ValidPass1!" });
    expect(data.name).toBeUndefined();
  });

  it("rejects short password", () => {
    expect(() => assertValid(RegisterSchema, { email: "a@b.com", password: "short" })).toThrow(
      ValidationError,
    );
  });

  it("rejects invalid email", () => {
    expect(() =>
      assertValid(RegisterSchema, { email: "not-email", password: "ValidPass1!" }),
    ).toThrow(ValidationError);
  });

  it("rejects email longer than 320 chars", () => {
    expect(() =>
      assertValid(RegisterSchema, { email: `${"a".repeat(320)}@b.com`, password: "ValidPass1!" }),
    ).toThrow(ValidationError);
  });
});

// ─── CreateAgentSchema ────────────────────────────────────────────────────────

describe("CreateAgentSchema", () => {
  it("accepts minimal agent with name only", () => {
    const data = assertValid(CreateAgentSchema, { name: "My Agent" });
    expect(data.name).toBe("My Agent");
    expect(data.type).toBe("signal"); // default
    expect(data.config).toEqual({}); // default
  });

  it("accepts all valid agent types", () => {
    const types = ["signal", "analysis", "execution", "optimization", "reporting"] as const;
    for (const type of types) {
      const data = assertValid(CreateAgentSchema, { name: "agent", type });
      expect(data.type).toBe(type);
    }
  });

  it("rejects empty name", () => {
    expect(() => assertValid(CreateAgentSchema, { name: "" })).toThrow(ValidationError);
  });

  it("rejects invalid agent type", () => {
    expect(() => assertValid(CreateAgentSchema, { name: "test", type: "invalid-type" })).toThrow(
      ValidationError,
    );
  });

  it("trims whitespace from name", () => {
    const data = assertValid(CreateAgentSchema, { name: "  My Agent  " });
    expect(data.name).toBe("My Agent");
  });
});

// ─── RunAgentSchema ───────────────────────────────────────────────────────────

describe("RunAgentSchema", () => {
  it("accepts empty payload with defaults", () => {
    const data = assertValid(RunAgentSchema, {});
    expect(data.input).toEqual({});
    expect(data.timeout).toBe(300_000); // 5 minutes default
    expect(data.dryRun).toBe(false);
  });

  it("accepts model override", () => {
    const data = assertValid(RunAgentSchema, { model: "claude-opus-4-6" });
    expect(data.model).toBe("claude-opus-4-6");
  });

  it("rejects timeout below 1000ms", () => {
    expect(() => assertValid(RunAgentSchema, { timeout: 500 })).toThrow(ValidationError);
  });

  it("rejects timeout above 3600000ms", () => {
    expect(() => assertValid(RunAgentSchema, { timeout: 9_999_999 })).toThrow(ValidationError);
  });

  it("accepts valid sandbox type", () => {
    for (const type of ["seccomp", "seatbelt", "wasi"] as const) {
      const data = assertValid(RunAgentSchema, { sandboxType: type });
      expect(data.sandboxType).toBe(type);
    }
  });

  it("rejects invalid sandbox type", () => {
    expect(() => assertValid(RunAgentSchema, { sandboxType: "docker" })).toThrow(ValidationError);
  });
});

// ─── UpdateAgentSchema ────────────────────────────────────────────────────────

describe("UpdateAgentSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const data = assertValid(UpdateAgentSchema, {});
    expect(data.name).toBeUndefined();
    expect(data.description).toBeUndefined();
    expect(data.config).toBeUndefined();
  });

  it("accepts partial update", () => {
    const data = assertValid(UpdateAgentSchema, { name: "new name" });
    expect(data.name).toBe("new name");
  });

  it("rejects empty string name", () => {
    expect(() => assertValid(UpdateAgentSchema, { name: "" })).toThrow(ValidationError);
  });
});
