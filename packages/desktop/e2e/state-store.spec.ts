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

// The store twin of smoke.spec.ts. Resolved tickets (the "done" fold) need the lifecycle events of ticket 43.
function storeFixture(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-store-"));
  execFileSync("git", ["init", "-q", repo]);
  dryland(repo, undefined, "init");
  dryland(repo, { effort: "shop", title: "Shop", destination: "Sell things.", fog: ["Payments"] }, "map", "create");
  dryland(repo, { effort: "shop", title: "Grill the cart", type: "grilling", report: "What?" }, "ticket", "create");
  dryland(
    repo,
    { effort: "shop", title: "Build the cart", type: "task", report: "Build it.", blockedBy: ["shop/01"] },
    "ticket",
    "create",
  );
  return repo;
}

test("on a store: shows the tree and legend, reopens the project, and shows maps with progress and tabs", async () => {
  const repo = storeFixture();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const launch = () => electron.launch({ args: [".", `--user-data-dir=${userData}`] });

  const first = await launch();
  await first.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  let window = await first.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  await expect(window.getByText("State store")).toBeVisible();
  await expect(window.getByRole("button", { name: /[▾▸] Shop/ })).toBeVisible();
  await expect(window.getByText("Grill the cart")).toBeVisible();
  await expect(window.getByText("blocked by 01")).toBeVisible();
  await expect(window.getByRole("img", { name: "Ready" }).first()).toHaveAttribute("title", "Ready");
  await expect(window.getByRole("complementary", { name: "Legend" })).toBeVisible();

  // The Maps view: one row per map with a bar matching its tickets and fog, and the map in a tab.
  await window.getByRole("button", { name: "Maps" }).click();
  await expect(window.getByRole("img", { name: "1 ready, 1 blocked, 1 fog" })).toBeVisible();
  await window.getByRole("button", { name: /^Shop/ }).click();
  await expect(window.getByRole("tab", { name: "shop" })).toHaveAttribute("aria-selected", "true");
  await expect(window.getByText("Sell things.")).toBeVisible();

  // A ticket opens in a tab with a details header that collapses.
  await window.getByRole("button", { name: "Tickets" }).click();
  await window.getByRole("button", { name: "Grill the cart" }).click();
  await expect(window.getByRole("tab")).toHaveCount(2);
  await expect(window.getByText("Claimant")).toBeVisible();
  await expect(window.getByText("What?")).toBeVisible();
  await window.getByRole("button", { name: /shop\/01 Grill the cart/ }).click();
  await expect(window.getByText("Claimant")).toHaveCount(0);

  await window.getByRole("button", { name: "Dismiss legend" }).click();
  await first.close();

  // After a restart the same project and tabs are back, and the legend stays dismissed.
  const second = await launch();
  window = await second.firstWindow();
  await expect(window.getByRole("button", { name: /[▾▸] Shop/ })).toBeVisible();
  await expect(window.getByRole("tab")).toHaveCount(2);
  await expect(window.getByRole("tab", { name: "shop/01" })).toHaveAttribute("aria-selected", "true");
  await expect(window.getByRole("complementary", { name: "Legend" })).toHaveCount(0);
  await second.close();
});
