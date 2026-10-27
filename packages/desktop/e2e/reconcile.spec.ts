import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { createMap, createTicket, dryland, git, storeRepo } from "./store-fixture.ts";

/** Claude Code's name for a history folder: every character that is not a letter or digit becomes `-`. */
const slug = (path: string) => path.replace(/[^a-zA-Z0-9]/g, "-");

test("finds a session started by hand in a claimed ticket's worktree when the window is focused", async () => {
  const repo = storeRepo("dryland-e2e-reconcile-");
  createMap(repo, "shop", "Shop");
  createTicket(repo, "shop", { title: "Grill the cart", report: "Build it." });
  const worktree = join(`${repo}.worktrees`, "shop-01-grill");
  git(repo, "worktree", "add", "-q", "-b", "shop/01-grill", worktree);
  // Claimed from the worktree, the way a session started by hand would claim it.
  dryland(worktree, undefined, "ticket", "claim", "shop/01");
  // Claude Code's history, kept apart from the user's own.
  const config = mkdtempSync(join(tmpdir(), "dryland-e2e-claude-"));

  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const env: Record<string, string> = { CLAUDE_CONFIG_DIR: config };
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] ??= v;
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`], env });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  await expect(window.getByRole("button", { name: "Grill the cart" })).toBeVisible();
  await expect(window.getByLabel("Session counts")).toHaveText("0 open · 0 hidden");

  await window.waitForTimeout(1500);
  // A session started by hand in the worktree, then the window gets focus.
  const history = join(config, "projects", slug(worktree));
  mkdirSync(history, { recursive: true });
  writeFileSync(join(history, "by-hand.jsonl"), '{"type":"user"}\n');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.emit("focus"));

  await expect(window.getByLabel("Session counts")).toHaveText("0 open · 0 hidden · 1 paused");
  await app.close();
});
