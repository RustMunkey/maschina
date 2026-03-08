import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "packages/sdk/*/vitest.config.ts",
  "services/*/vitest.config.ts",
]);
