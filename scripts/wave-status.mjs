// One-screen status of the ticket worktrees under .claude/worktrees and of the heavy-test lock.
// Usage: node scripts/wave-status.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const trees = join(root, ".claude", "worktrees");

const run = (cwd, command, args) => spawnSync(command, args, { cwd, encoding: "utf8" }).stdout?.trim() ?? "";
const git = (cwd, ...args) => run(cwd, "git", args);

// Only registered worktrees: a removed one can leave its node_modules directory behind.
const registered = git(root, "worktree", "list", "--porcelain")
  .split("\n")
  .filter((line) => line.startsWith("worktree "))
  .map((line) => line.slice(9).replaceAll("\\", "/"));
const names = (existsSync(trees) ? readdirSync(trees) : []).filter((name) =>
  registered.some((path) => path.endsWith(`/.claude/worktrees/${name}`)),
);
if (names.length === 0) console.log("no ticket worktrees");
for (const name of names) {
  const dir = join(trees, name);
  const ahead = git(dir, "rev-list", "--count", "main..HEAD");
  const last = git(dir, "log", "-1", "--format=%ar: %s", "main..HEAD") || "no commits yet";
  const diff = git(dir, "diff", "main", "--shortstat") || "no diff";
  const dirty = git(dir, "status", "--short").split("\n").filter(Boolean).length;
  console.log(`${name}: ${ahead} commits, ${dirty} uncommitted\n  last: ${last}\n  vs main: ${diff}`);
}

const lock = join(tmpdir(), "dryland-heavy-test.lock");
if (existsSync(lock)) {
  let owner = "no owner file";
  try {
    const pid = Number(readFileSync(join(lock, "pid"), "utf8"));
    try {
      process.kill(pid, 0);
      owner = `pid ${pid} alive`;
    } catch {
      owner = `pid ${pid} gone (stale; the next with-lock run reclaims it)`;
    }
  } catch {}
  console.log(`heavy-test lock: held, ${owner}`);
} else console.log("heavy-test lock: free");

const containers = run(root, "docker", ["ps", "--format", "{{.Image}} {{.Status}}"]);
console.log(`docker containers: ${containers || "none"}`);
