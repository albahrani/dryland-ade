import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

const width = async (window: Page, selector: string) =>
  Math.round((await window.locator(selector).boundingBox())!.width);

/** Drags a panel's handle by `dx` pixels, one real mouse gesture. */
async function drag(window: Page, name: string, dx: number) {
  const box = (await window.getByRole("separator", { name }).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await window.mouse.move(x, y);
  await window.mouse.down();
  await window.mouse.move(x + dx / 2, y);
  await window.mouse.move(x + dx, y);
  await window.mouse.up();
}

test("resizes the side panels by dragging or arrow keys within limits, and keeps the widths across a restart", async () => {
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const launch = async () => {
    const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
    const window = await app.firstWindow();
    await expect(window.getByRole("button", { name: "Open project..." })).toBeVisible();
    return { app, window };
  };

  const first = await launch();
  expect(await width(first.window, ".sidebar")).toBe(320);
  expect(await width(first.window, ".right-side")).toBe(240);

  await drag(first.window, "Resize left panel", 100);
  expect(await width(first.window, ".sidebar")).toBe(420);

  // The right panel grows as its handle moves left.
  await drag(first.window, "Resize right panel", -60);
  expect(await width(first.window, ".right-side")).toBe(300);

  // Past the limits it stops at the minimum and maximum.
  await drag(first.window, "Resize left panel", -2000);
  expect(await width(first.window, ".sidebar")).toBe(200);
  await drag(first.window, "Resize right panel", -2000);
  expect(await width(first.window, ".right-side")).toBeLessThanOrEqual(560);

  await first.window.getByRole("separator", { name: "Resize left panel" }).focus();
  await first.window.keyboard.press("ArrowRight");
  expect(await width(first.window, ".sidebar")).toBe(216);
  await first.app.close();

  const second = await launch();
  expect(await width(second.window, ".sidebar")).toBe(216);
  expect(await width(second.window, ".right-side")).toBe(560);
  await second.app.close();
});
