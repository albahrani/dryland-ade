import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { storeRepo } from "./store-fixture.ts";

async function launch() {
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  return { app, window: await app.firstWindow() };
}

test("one 36 px top bar holds the menu button and the project widget, with no native menu row", async () => {
  const { app, window } = await launch();
  const bar = window.locator("header.titlebar");
  expect((await bar.boundingBox())!.height).toBe(36);
  if (process.platform !== "darwin") {
    await expect(bar.getByRole("button", { name: "Menu" })).toBeVisible();
    // No native menu row: the page starts at the top of the content area.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getContentBounds().y)).toBe(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds().y),
    );
  }
  await expect(bar.getByRole("button", { name: "Open project..." })).toBeVisible();
  await app.close();
});

test("the Tickets activity icon is a checklist, not the menu glyph", async () => {
  const { app, window } = await launch();
  await expect(
    window.getByRole("navigation", { name: "Activity bar" }).getByRole("button", { name: "Tickets" }),
  ).toHaveText("☑");
  await app.close();
});

test.describe("the menu button", () => {
  test.skip(process.platform === "darwin", "macOS keeps its native menu bar");

  test("offers the menus, disables project commands without a project, and closes on Escape and outside click", async () => {
    const { app, window } = await launch();
    await window.getByRole("button", { name: "Menu" }).click();
    const menu = window.getByRole("menu", { name: "Main menu" });
    for (const name of ["File", "Sessions", "View", "Help"]) {
      await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole("menuitem", { name: "New Ticket..." })).toBeDisabled();
    await expect(menu.getByRole("menuitem", { name: "Settings..." })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: "Settings..." })).toContainText("Ctrl+,");

    await window.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await window.getByRole("button", { name: "Menu" }).click();
    await expect(menu).toBeVisible();
    await window.locator(".editor").click({ position: { x: 20, y: 200 } });
    await expect(menu).toBeHidden();
    await app.close();
  });

  test("runs a command, and enables the project commands once a project is open", async () => {
    const repo = storeRepo("dryland-e2e-titlebar-");
    const { app, window } = await launch();
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, repo);

    await window.getByRole("button", { name: "Menu" }).click();
    await window.getByRole("menuitem", { name: "Open Project..." }).click();
    await expect(window.getByRole("button", { name: /^.+ ▾$/ })).toBeVisible();

    await window.getByRole("button", { name: "Menu" }).click();
    await expect(window.getByRole("menuitem", { name: "New Ticket..." })).toBeEnabled();
    await window.getByRole("menuitem", { name: "Settings..." }).click();
    await expect(window.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await app.close();
  });
});
