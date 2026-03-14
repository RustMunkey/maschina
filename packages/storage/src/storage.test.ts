import { describe, expect, it, vi } from "vitest";
import { StorageClient } from "./client.js";
import { StorageKeys } from "./keys.js";

// ── Key helpers ────────────────────────────────────────────────────────────

describe("StorageKeys", () => {
  it("builds agent artifact keys", () => {
    expect(StorageKeys.agentArtifact("u1", "a1", "output.json")).toBe(
      "agent-artifacts/u1/a1/output.json",
    );
  });

  it("builds task output keys", () => {
    expect(StorageKeys.taskOutput("u1", "r1", "result.json")).toBe(
      "task-outputs/u1/r1/result.json",
    );
  });

  it("builds upload keys", () => {
    expect(StorageKeys.upload("u1", "up1", "file.pdf")).toBe("uploads/u1/up1/file.pdf");
  });
});

// ── Public URL helpers ─────────────────────────────────────────────────────

describe("StorageClient.publicUrl", () => {
  it("returns S3 URL when no CloudFront configured", () => {
    const client = new StorageClient({ bucket: "my-bucket" });
    expect(client.publicUrl("agent-artifacts/u1/a1/out.json")).toBe(
      "https://my-bucket.s3.amazonaws.com/agent-artifacts/u1/a1/out.json",
    );
  });

  it("returns CloudFront URL when configured", () => {
    const client = new StorageClient({
      bucket: "my-bucket",
      cloudfrontUrl: "https://cdn.maschina.ai",
    });
    expect(client.publicUrl("uploads/u1/up1/file.pdf")).toBe(
      "https://cdn.maschina.ai/uploads/u1/up1/file.pdf",
    );
  });

  it("trims trailing slash from CloudFront URL", () => {
    const client = new StorageClient({
      bucket: "my-bucket",
      cloudfrontUrl: "https://cdn.maschina.ai/",
    });
    expect(client.publicUrl("test/key")).toBe("https://cdn.maschina.ai/test/key");
  });
});
