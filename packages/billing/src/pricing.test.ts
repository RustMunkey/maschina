import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECHARGE_AMOUNT_CENTS,
  DEFAULT_RECHARGE_THRESHOLD_CENTS,
  MIN_TOPUP_CENTS,
  PRICING_RATES,
  TOPUP_OPTIONS,
  calculateCost,
} from "./pricing.js";

// ─── PRICING_RATES ────────────────────────────────────────────────────────────

describe("PRICING_RATES", () => {
  it("modelTokensPer1k is $0.002 (targets $2/1M tokens)", () => {
    expect(PRICING_RATES.modelTokensPer1k).toBe(0.2);
  });

  it("agentExecution is 1 cent per run", () => {
    expect(PRICING_RATES.agentExecution).toBe(1);
  });

  it("apiCall is 0.01 cents", () => {
    expect(PRICING_RATES.apiCall).toBe(0.01);
  });

  it("storageGbPerMonth is 10 cents ($0.10/GB)", () => {
    expect(PRICING_RATES.storageGbPerMonth).toBe(10);
  });
});

// ─── calculateCost — modelTokens ─────────────────────────────────────────────

describe("calculateCost(modelTokens)", () => {
  it("1000 tokens = ceil(0.2) = 1 cent", () => {
    expect(calculateCost("modelTokens", 1000)).toBe(1);
  });

  it("1M tokens = 200 cents ($2.00)", () => {
    expect(calculateCost("modelTokens", 1_000_000)).toBe(200);
  });

  it("0 tokens = 0 cents", () => {
    expect(calculateCost("modelTokens", 0)).toBe(0);
  });

  it("1 token = ceil(0.0002) = 1 cent (rounds up)", () => {
    expect(calculateCost("modelTokens", 1)).toBe(1);
  });

  it("500 tokens = ceil(0.1) = 1 cent", () => {
    expect(calculateCost("modelTokens", 500)).toBe(1);
  });

  it("5000 tokens = 1 cent", () => {
    expect(calculateCost("modelTokens", 5000)).toBe(1);
  });

  it("10000 tokens = 2 cents", () => {
    expect(calculateCost("modelTokens", 10_000)).toBe(2);
  });
});

// ─── calculateCost — agentExecution ──────────────────────────────────────────

describe("calculateCost(agentExecution)", () => {
  it("1 run = 1 cent", () => {
    expect(calculateCost("agentExecution", 1)).toBe(1);
  });

  it("100 runs = 100 cents ($1.00)", () => {
    expect(calculateCost("agentExecution", 100)).toBe(100);
  });

  it("0 runs = 0 cents", () => {
    expect(calculateCost("agentExecution", 0)).toBe(0);
  });
});

// ─── calculateCost — apiCall ──────────────────────────────────────────────────

describe("calculateCost(apiCall)", () => {
  it("1 call = ceil(0.01) = 1 cent", () => {
    expect(calculateCost("apiCall", 1)).toBe(1);
  });

  it("100 calls = 1 cent (still rounds up to 1)", () => {
    expect(calculateCost("apiCall", 100)).toBe(1);
  });

  it("10000 calls = 100 cents ($1.00)", () => {
    expect(calculateCost("apiCall", 10_000)).toBe(100);
  });

  it("0 calls = 0", () => {
    expect(calculateCost("apiCall", 0)).toBe(0);
  });
});

// ─── calculateCost — storageGb ────────────────────────────────────────────────

describe("calculateCost(storageGb)", () => {
  it("1 GB = 10 cents", () => {
    expect(calculateCost("storageGb", 1)).toBe(10);
  });

  it("10 GB = 100 cents ($1.00)", () => {
    expect(calculateCost("storageGb", 10)).toBe(100);
  });

  it("0 GB = 0 cents", () => {
    expect(calculateCost("storageGb", 0)).toBe(0);
  });
});

// ─── TOPUP_OPTIONS ────────────────────────────────────────────────────────────

describe("TOPUP_OPTIONS", () => {
  it("has 5 options", () => {
    expect(TOPUP_OPTIONS).toHaveLength(5);
  });

  it("options are in ascending cent order", () => {
    const cents = TOPUP_OPTIONS.map((o) => o.cents);
    for (let i = 0; i < cents.length - 1; i++) {
      const curr = cents[i];
      const next = cents[i + 1];
      if (curr !== undefined && next !== undefined) {
        expect(next).toBeGreaterThan(curr);
      }
    }
  });

  it("smallest option is MIN_TOPUP_CENTS ($5)", () => {
    expect(TOPUP_OPTIONS[0]?.cents).toBe(MIN_TOPUP_CENTS);
    expect(MIN_TOPUP_CENTS).toBe(500);
  });

  it("largest option is $100 (10000 cents)", () => {
    const last = TOPUP_OPTIONS[TOPUP_OPTIONS.length - 1];
    expect(last?.cents).toBe(10_000);
    expect(last?.displayAmount).toBe("$100");
  });

  it("all options have unique ids", () => {
    const ids = TOPUP_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("displayAmount matches cents", () => {
    const expected: Record<number, string> = {
      500: "$5",
      1000: "$10",
      2000: "$20",
      5000: "$50",
      10000: "$100",
    };
    for (const opt of TOPUP_OPTIONS) {
      expect(opt.displayAmount).toBe(expected[opt.cents]);
    }
  });
});

// ─── Constants ────────────────────────────────────────────────────────────────

describe("billing constants", () => {
  it("default recharge threshold is $5", () => {
    expect(DEFAULT_RECHARGE_THRESHOLD_CENTS).toBe(500);
  });

  it("default recharge amount is $20", () => {
    expect(DEFAULT_RECHARGE_AMOUNT_CENTS).toBe(2000);
  });
});
