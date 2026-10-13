import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    globalSetup: ["packages/cli/test/global-setup.ts"],
    testTimeout: 30_000,
  },
});
