import { describe, expect, it } from "vitest";
import { calcExecutionRevenue, calcRevenueShare, generateSlug } from "./index.js";

// ─── calcRevenueShare ──────────────────────────────────────────────────────────

describe("calcRevenueShare", () => {
  it("splits 70/30 seller/platform", () => {
    const result = calcRevenueShare(1000);
    expect(result.sellerCents).toBe(700);
    expect(result.platformCents).toBe(300);
  });

  it("sums to total", () => {
    for (const total of [100, 999, 1234, 5000, 10000]) {
      const { sellerCents, platformCents } = calcRevenueShare(total);
      expect(sellerCents + platformCents).toBe(total);
    }
  });

  it("floors seller cents to avoid overpaying", () => {
    // 1 cent: seller gets 0 (floor of 0.7), platform gets 1
    const result = calcRevenueShare(1);
    expect(result.sellerCents).toBe(0);
    expect(result.platformCents).toBe(1);
  });

  it("handles zero", () => {
    const result = calcRevenueShare(0);
    expect(result.sellerCents).toBe(0);
    expect(result.platformCents).toBe(0);
  });

  it("$10 listing: seller gets $7, platform gets $3", () => {
    const result = calcRevenueShare(1000);
    expect(result.sellerCents).toBe(700);
    expect(result.platformCents).toBe(300);
  });
});

// ─── calcExecutionRevenue ──────────────────────────────────────────────────────

describe("calcExecutionRevenue", () => {
  it("splits 65/20/10/5 for 1000 cents", () => {
    const result = calcExecutionRevenue(1000);
    expect(result.nodeCents).toBe(650);
    expect(result.developerCents).toBe(200);
    expect(result.treasuryCents).toBe(100);
    expect(result.validatorCents).toBe(50);
  });

  it("sums to total", () => {
    for (const total of [100, 1000, 9999, 12345]) {
      const r = calcExecutionRevenue(total);
      expect(r.nodeCents + r.developerCents + r.treasuryCents + r.validatorCents).toBe(total);
    }
  });

  it("validator gets the remainder to absorb rounding", () => {
    // 99 cents: node=64, dev=19, treasury=9, validator=7
    const r = calcExecutionRevenue(99);
    expect(r.nodeCents).toBe(64);
    expect(r.developerCents).toBe(19);
    expect(r.treasuryCents).toBe(9);
    expect(r.nodeCents + r.developerCents + r.treasuryCents + r.validatorCents).toBe(99);
  });

  it("handles zero", () => {
    const r = calcExecutionRevenue(0);
    expect(r.nodeCents).toBe(0);
    expect(r.developerCents).toBe(0);
    expect(r.treasuryCents).toBe(0);
    expect(r.validatorCents).toBe(0);
  });
});

// ─── generateSlug ─────────────────────────────────────────────────────────────

describe("generateSlug", () => {
  it("lowercases the name", () => {
    expect(generateSlug("My Agent", "abc123")).toBe("my-agent-abc123");
  });

  it("replaces spaces and special chars with hyphens", () => {
    expect(generateSlug("Hello World!", "x1")).toBe("hello-world-x1");
  });

  it("collapses multiple separators into one hyphen", () => {
    expect(generateSlug("foo  ---  bar", "y2")).toBe("foo-bar-y2");
  });

  it("strips leading and trailing hyphens from base", () => {
    expect(generateSlug("---agent---", "z3")).toBe("agent-z3");
  });

  it("truncates base to 60 chars", () => {
    const longName = "a".repeat(80);
    const slug = generateSlug(longName, "s1");
    expect(slug).toBe(`${"a".repeat(60)}-s1`);
  });

  it("appends suffix after base", () => {
    const slug = generateSlug("code-review", "abc123def");
    expect(slug).toBe("code-review-abc123def");
  });
});
