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
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      include: ["packages/*/src/**/*.ts", "services/*/src/**/*.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.test.ts", "**/*.d.ts"],
      thresholds: {
        lines: 3,
        functions: 3,
        branches: 3,
        statements: 3,
      },
    },
  },
});
