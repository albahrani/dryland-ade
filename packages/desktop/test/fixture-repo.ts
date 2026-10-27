import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Every store lives under one data dir of this run, never in the real user data dir.
process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-desktop-data-"));

const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

/**
 * Runs the built `dryland` in `repo`, with `input` on stdin when given. The same command agents run, so a fixture
 * is made through the real write path. Outside any Dryland session, so nothing is reported to a running app.
 */
export function dryland(repo: string, input: unknown, ...args: string[]): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ["DRYLAND_PORT", "DRYLAND_TOKEN", "DRYLAND_SESSION_ID", "CLAUDE_CODE_SESSION_ID"]) {
    delete env[name];
  }
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: repo,
    env,
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * A committed repo on `main` whose state store holds the effort `shop` with a resolved ticket (shop/01), one ready
 * ticket (shop/02) and one blocked by it (shop/03).
 */
export function fixtureRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "dryland-desktop-repo-")));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  git("commit", "-q", "--allow-empty", "-m", "Fixture");
  dryland(repo, undefined, "init");
  dryland(repo, { effort: "shop", title: "Shop", destination: "Sell things." }, "map", "create");
  const create = (title: string, blockedBy: string[] = []) =>
    dryland(repo, { effort: "shop", title, type: "task", report: "Build it.", blockedBy }, "ticket", "create");
  create("Set up the repo");
  dryland(repo, undefined, "ticket", "resolve", "shop/01", "--answer", "Done.");
  create("Grill the cart");
  create("Build the cart", ["shop/02"]);
  return repo;
}
