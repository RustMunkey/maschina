import { describe, expect, it } from "vitest";
import { InsufficientRoleError } from "../errors.js";
import { hasPlan, hasRole, planFeatures, requireRole } from "../rbac.js";
import type { AuthContext } from "../types.js";

const ctx = (role: AuthContext["role"], plan: AuthContext["plan"]): AuthContext => ({
  userId: "user-1",
  email: "ash@maschina.ai",
  role,
  plan,
  method: "jwt",
});

describe("hasRole", () => {
  it("owner has all roles", () => {
    expect(hasRole("owner", "viewer")).toBe(true);
    expect(hasRole("owner", "member")).toBe(true);
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("owner", "owner")).toBe(true);
  });

  it("viewer cannot satisfy member+", () => {
    expect(hasRole("viewer", "member")).toBe(false);
    expect(hasRole("viewer", "admin")).toBe(false);
  });

  it("admin cannot satisfy owner", () => {
    expect(hasRole("admin", "owner")).toBe(false);
  });
});

describe("requireRole", () => {
  it("passes for sufficient role", () => {
    expect(() => requireRole(ctx("admin", "m5"), "member")).not.toThrow();
  });

  it("throws InsufficientRoleError for insufficient role", () => {
    expect(() => requireRole(ctx("member", "access"), "admin")).toThrow(InsufficientRoleError);
  });
});

describe("hasPlan", () => {
  it("enterprise has all plans", () => {
    expect(hasPlan("enterprise", "access")).toBe(true);
    expect(hasPlan("enterprise", "m1")).toBe(true);
    expect(hasPlan("enterprise", "m5")).toBe(true);
    expect(hasPlan("enterprise", "enterprise")).toBe(true);
  });

  it("free cannot satisfy operator+", () => {
    expect(hasPlan("access", "m1")).toBe(false);
  });
});

describe("planFeatures", () => {
  it("access cannot use API keys", () => {
    expect(planFeatures.canUseApiKeys("access")).toBe(false);
  });

  it("m1 can use API keys", () => {
    expect(planFeatures.canUseApiKeys("m1")).toBe(true);
  });

  it("enterprise has unlimited agents", () => {
    expect(planFeatures.hasUnlimitedAgents("enterprise")).toBe(true);
    expect(planFeatures.hasUnlimitedAgents("m1")).toBe(false);
  });
});
