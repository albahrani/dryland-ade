import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    globalSetup: ["packages/cli/test/global-setup.ts"],
    testTimeout: 30_000,
    // The git setup in a hook is slow on the Windows runner (more than 10 s there); it gets the tests' allowance.
    hookTimeout: 30_000,
  },
});
