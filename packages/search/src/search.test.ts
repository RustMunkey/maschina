import { beforeEach, describe, expect, it, vi } from "vitest";
import { INDEXES } from "./indexes.js";

describe("INDEXES", () => {
  it("has expected index names", () => {
    expect(INDEXES.agents).toBe("agents");
    expect(INDEXES.users).toBe("users");
    expect(INDEXES.marketplace).toBe("marketplace");
    expect(INDEXES.docs).toBe("docs");
  });
});

describe("search module exports", () => {
  it("exports all expected functions", async () => {
    const mod = await import("./index.js");
    expect(typeof mod.getMeili).toBe("function");
    expect(typeof mod.ensureIndexes).toBe("function");
    expect(typeof mod.search).toBe("function");
    expect(typeof mod.upsertDocument).toBe("function");
    expect(typeof mod.upsertDocuments).toBe("function");
    expect(typeof mod.deleteDocument).toBe("function");
  });
});

describe("getMeili", () => {
  it("returns a client with default host when env vars are unset", async () => {
    const { getMeili } = await import("./client.js");
    const client = getMeili();
    expect(client).toBeDefined();
    // Verify it's a singleton — same reference on second call
    expect(getMeili()).toBe(client);
  });
});
