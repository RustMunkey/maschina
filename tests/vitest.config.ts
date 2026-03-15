import path from "node:path";
import { defineConfig } from "vitest/config";

// Resolve all @maschina/* workspace packages to their source files.
// This ensures vi.mock("@maschina/db", ...) registers under the same
// resolved path that services/api's imports resolve to, making mocks work
// across package boundaries in the monorepo.
const packagesDir = path.resolve(__dirname, "../packages");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@maschina\/(.+)$/,
        replacement: `${packagesDir}/$1/src/index.ts`,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts", "e2e/**/*.spec.ts"],
    passWithNoTests: true,
  },
});
