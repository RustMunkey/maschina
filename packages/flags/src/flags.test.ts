import { describe, expect, it } from "vitest";
import { FlagClient } from "./client.js";
import { FLAGS, type FlagName } from "./flags.js";

describe("FlagClient", () => {
  function makeClient(overrides: Partial<Record<FlagName, boolean>> = {}): FlagClient {
    const values = new Map<FlagName, boolean>();
    for (const key of Object.keys(FLAGS) as FlagName[]) {
      values.set(key, overrides[key] ?? FLAGS[key].defaultValue);
    }
    return new FlagClient(values);
  }

  it("returns default values when no overrides", () => {
    const client = makeClient();
    expect(client.is("marketplaceEnabled")).toBe(true);
    expect(client.is("memoryEnabled")).toBe(false);
    expect(client.is("proofOfComputeEnabled")).toBe(false);
  });

  it("respects overrides", () => {
    const client = makeClient({ memoryEnabled: true, marketplaceEnabled: false });
    expect(client.is("memoryEnabled")).toBe(true);
    expect(client.is("marketplaceEnabled")).toBe(false);
  });

  it("all() returns all flags", () => {
    const client = makeClient();
    const all = client.all();
    expect(Object.keys(all)).toEqual(Object.keys(FLAGS));
    expect(typeof all.marketplaceEnabled).toBe("boolean");
  });
});

describe("FLAGS", () => {
  it("all flags have a boolean defaultValue", () => {
    for (const [name, def] of Object.entries(FLAGS)) {
      expect(typeof def.defaultValue, `${name}.defaultValue`).toBe("boolean");
    }
  });
});
