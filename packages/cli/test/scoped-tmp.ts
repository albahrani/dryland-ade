import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Set in the process that scoped the temp directory, and inherited by the workers and apps it starts. */
const SCOPED = "DRYLAND_TEST_TMP";

/**
 * Points the OS temp directory at a folder of this test run alone, so every `mkdtemp(join(tmpdir(), ...))` in the
 * tests and in the apps they start lands inside it. `removeScopedTmp` deletes it when the run ends. Without it, each
 * run left its `dryland-*` folders in the real temp directory for good.
 */
export function scopeTmp(): string {
  const existing = process.env[SCOPED];
  if (existing) return existing;
  const dir = mkdtempSync(join(tmpdir(), "dryland-run-"));
  process.env[SCOPED] = dir;
  // Windows reads TEMP and TMP, POSIX TMPDIR.
  process.env.TMPDIR = process.env.TEMP = process.env.TMP = dir;
  return dir;
}

/** Deletes the folder `scopeTmp` made. Retries, because a just-stopped process can hold a file for a moment on Windows. */
export function removeScopedTmp(): void {
  const dir = process.env[SCOPED];
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    console.warn(`Could not remove the test temp directory ${dir}: ${String(error)}`);
  }
}
