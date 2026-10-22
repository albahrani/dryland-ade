import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { scopeTmp } from "../cli/test/scoped-tmp.ts";

// All the run's temp folders go in one directory, which the global teardown deletes.
scopeTmp();

// Every app the tests launch writes its live-reporting lock file here, never where a real Dryland keeps it.
process.env.DRYLAND_APP_DIR ??= mkdtempSync(join(tmpdir(), "dryland-e2e-app-"));

export default defineConfig({
  testDir: "e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  // CI runners are slower, above all on Windows, where every process start costs more.
  timeout: process.env.CI ? 120_000 : 60_000,
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
});
