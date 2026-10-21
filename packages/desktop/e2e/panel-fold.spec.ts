import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("folds each side panel away, opens it again, and keeps the folded state across a restart", async () => {
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const launch = async () => {
    const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
    const window = await app.firstWindow();
    await expect(window.getByRole("button", { name: "Open project..." })).toBeVisible();
    return { app, window };
  };

  const first = await launch();
  await expect(first.window.locator(".sidebar")).toBeVisible();
  await expect(first.window.locator(".right-side")).toBeVisible();

  await first.window.getByRole("button", { name: "Hide left panel" }).click();
  await expect(first.window.locator(".sidebar")).toBeHidden();
  await expect(first.window.locator(".right-side")).toBeVisible();

  await first.window.getByRole("button", { name: "Hide right panel" }).click();
  await expect(first.window.locator(".right-side")).toBeHidden();

  await first.window.getByRole("button", { name: "Show left panel" }).click();
  await expect(first.window.locator(".sidebar")).toBeVisible();
  expect(Math.round((await first.window.locator(".sidebar").boundingBox())!.width)).toBe(320);
  await first.app.close();

  const second = await launch();
  await expect(second.window.locator(".sidebar")).toBeVisible();
  await expect(second.window.locator(".right-side")).toBeHidden();
  await expect(second.window.getByRole("button", { name: "Show right panel" })).toBeVisible();
  await second.app.close();
});
