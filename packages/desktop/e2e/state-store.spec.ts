import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

const dryland = (repo: string, input: unknown, ...args: string[]) =>
  execFileSync(process.execPath, [CLI, ...args], {
    cwd: repo,
    env: { ...process.env, DRYLAND_APP_DIR: repo },
    input: input === undefined ? undefined : JSON.stringify(input),
  });

test("shows a store repo's tickets and maps with no tracker files, and refreshes when the state ref moves", async () => {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-store-"));
  execFileSync("git", ["init", "-q", repo]);
  dryland(repo, undefined, "init");
  dryland(repo, { effort: "shop", title: "Shop", destination: "Sell things.", fog: ["Payments"] }, "map", "create");
  dryland(
    repo,
    { effort: "shop", title: "Grill the cart", type: "grilling", report: "Which cart?" },
    "ticket",
    "create",
  );
  dryland(
    repo,
    {
      effort: "shop",
      title: "Build the cart",
      type: "task",
      report: "Build it.",
      criteria: [{ text: "Adds items", done: false }],
      blockedBy: ["shop/01"],
    },
    "ticket",
    "create",
  );

  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  await expect(window.getByRole("button", { name: /[▾▸] Shop/ })).toBeVisible();
  await expect(window.getByText("Grill the cart")).toBeVisible();
  await expect(window.getByText("blocked by 01")).toBeVisible();

  // The ticket tab shows the Report and the criteria.
  await window.getByRole("button", { name: "Build the cart" }).click();
  await expect(window.getByText("Build it.")).toBeVisible();
  await expect(window.getByText("Adds items")).toBeVisible();

  // A write to the store, from outside the app, refreshes the tree.
  dryland(
    repo,
    { effort: "shop", title: "Pick a payment provider", type: "task", report: "Pick one." },
    "ticket",
    "create",
  );
  await expect(window.getByText("Pick a payment provider")).toBeVisible({ timeout: 10_000 });

  await app.close();
});
