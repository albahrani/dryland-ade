import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("Help > About states that Dryland is unofficial and credits Matt Pocock's skills", async () => {
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  const window = await app.firstWindow();
  await expect(window.getByRole("button", { name: "Open project..." })).toBeVisible();

  await app.evaluate(({ Menu }) => {
    const help = Menu.getApplicationMenu()?.items.find((item) => item.label === "Help");
    help?.submenu?.items.find((item) => item.label === "About Dryland ADE")?.click();
  });
  const about = window.getByRole("dialog", { name: "About Dryland ADE" });
  await expect(about).toContainText("unofficial, community-made");
  await expect(about).toContainText("Matt Pocock's skills");

  await about.getByRole("button", { name: "Close" }).click();
  await expect(about).toHaveCount(0);
  await app.close();
});
