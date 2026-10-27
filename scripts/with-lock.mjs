// Runs a command while holding a machine-wide lock, so heavy suites from parallel worktrees run one at a time.
// Usage: node scripts/with-lock.mjs <command> [args...]   e.g. node scripts/with-lock.mjs pnpm test:linux
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const lock = join(tmpdir(), "dryland-heavy-test.lock");
const retryMs = 15_000;
const graceMs = 60_000; // a lock without an owner file yet is only just taken

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/with-lock.mjs <command> [args...]");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A killed run (a timeout, taskkill) skips its release handler and leaves the lock behind; the owner's pid tells.
function ownerIsGone() {
  try {
    process.kill(Number(readFileSync(join(lock, "pid"), "utf8")), 0);
    return false;
  } catch (error) {
    if (error.code === "ESRCH") return true;
    if (error.code === "ENOENT") return Date.now() - statSync(lock).mtimeMs > graceMs;
    return false;
  }
}

async function acquire() {
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "pid"), String(process.pid));
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (ownerIsGone()) rmSync(lock, { recursive: true, force: true });
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
