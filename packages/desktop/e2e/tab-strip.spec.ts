import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const write = (root: string, file: string, content: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
};

test("keeps the tab strip at full height while a tab with a long file is shown", async () => {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-tabs-"));
  write(repo, "docs/agents/issue-tracker.md", "# Issue tracker: Local markdown\n");
  write(repo, "short.txt", "short\n");
  write(repo, "long.txt", Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
  execFileSync("git", ["init", "-q", repo]);

  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  const explorer = window.getByRole("region", { name: "Explorer" });

  await explorer.getByRole("tree").getByRole("button", { name: "short.txt", exact: true }).click();
  await explorer.getByRole("tree").getByRole("button", { name: "long.txt", exact: true }).click();
  await expect(window.getByRole("region", { name: "File long.txt" })).toContainText("line 400");

  // Clicking a tab shows its content; the strip must stay as tall as its tabs.
  await window.getByRole("tab", { name: "short.txt" }).click();
  await window.getByRole("tab", { name: "long.txt" }).click();
  const tab = window.getByRole("tab", { name: "long.txt" });
  await expect(tab).toBeInViewport();
  expect((await window.locator(".tabbar").boundingBox())!.height).toBeGreaterThanOrEqual(
    (await tab.boundingBox())!.height,
  );
  await app.close();
});
