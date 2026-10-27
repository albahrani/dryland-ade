// Runs a command while holding a machine-wide lock, so heavy suites from parallel worktrees run one at a time.
// Usage: node scripts/with-lock.mjs <command> [args...]   e.g. node scripts/with-lock.mjs pnpm test:linux
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const lock = join(tmpdir(), "dryland-heavy-test.lock");
const retryMs = 15_000;
const staleMs = 90 * 60_000; // a killed run leaves its lock behind

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/with-lock.mjs <command> [args...]");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire() {
  for (;;) {
    try {
      mkdirSync(lock);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() - statSync(lock).mtimeMs > staleMs) rmSync(lock, { recursive: true, force: true });
      else await sleep(retryMs);
    }
  }
}

await acquire();
const release = () => rmSync(lock, { recursive: true, force: true });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    release();
    process.exit(130);
  });
}

const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
release();
process.exit(result.status ?? 1);
