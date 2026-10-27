import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type FixtureEffort, seedStore } from "../src/index.ts";

/**
 * A git repo on branch `main` that has committed `files` and keeps `efforts` in its state store, the one fixture the
 * core tests build their repos from. Every store lives under one temp data dir of the run.
 */
export async function storeRepo(efforts: FixtureEffort[] = [], files: Record<string, string> = {}): Promise<string> {
  process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-data-"));
  const path = realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-store-repo-")));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: path, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(path, file)), { recursive: true });
    writeFileSync(join(path, file), content);
  }
  git("add", ".");
  git("commit", "-q", "--allow-empty", "-m", "Fixture");
  await seedStore(path, efforts);
  return path;
}

/** One `shop` effort with a single ticket, `shop/01`, the shape most worktree and merge tests need. */
export const SHOP_CART: FixtureEffort[] = [
  { effort: "shop", map: { title: "Shop" }, tickets: [{ title: "Cart", report: "Build it." }] },
];
