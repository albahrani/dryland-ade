import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Every app the tests launch writes its live-reporting lock file here, never where a real Dryland keeps it.
process.env.DRYLAND_APP_DIR ??= mkdtempSync(join(tmpdir(), "dryland-e2e-app-"));

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
});
