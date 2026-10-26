import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

const dryland = (repo: string, ...args: string[]) =>
  execFileSync(process.execPath, [CLI, ...args], { cwd: repo, env: { ...process.env, DRYLAND_APP_DIR: repo } });

test("lists and opens a ticket created in the state store, with no tracker files in the repo", async () => {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-store-"));
  execFileSync("git", ["init", "-q", repo]);
  dryland(repo, "init");
  dryland(
    repo,
    "ticket",
    "create",
    "--map",
    "shop",
    "--title",
    "Pick a cart",
    "--type",
    "task",
    "--question",
    "Which?",
  );

  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  await window.getByRole("button", { name: "Pick a cart" }).click();
  await expect(window.getByText("Which?")).toBeVisible();

  await app.close();
});
