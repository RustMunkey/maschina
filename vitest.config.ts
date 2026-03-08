import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "services/*/src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Rust/Python packages — tested in dedicated CI jobs
      "packages/cli/**",
      "packages/code/**",
      "packages/runtime/**",
      "packages/agents/**",
      "packages/risk/**",
      "packages/ml/**",
    ],
    passWithNoTests: true,
  },
});
