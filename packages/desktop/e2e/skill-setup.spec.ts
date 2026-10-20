import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("shows the banner for a repo without skills, then the setup state as the files change", async () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "dryland-e2e-skill-setup-")));
  execFileSync("git", ["init", "-q", repo]);
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  const panel = window.getByRole("alert", { name: "Skill setup" });
  await expect(panel).toContainText("Skills are not set up in this repo");
  await expect(panel).toContainText("/setup-matt-pocock-skills");

  // Setting up the repo changes the state without a restart: a tracker doc and an unknown skill.
  mkdirSync(join(repo, "docs", "agents"), { recursive: true });
  writeFileSync(join(repo, "docs", "agents", "issue-tracker.md"), "# Issue tracker: Local markdown\n");
  mkdirSync(join(repo, ".agents", "skills", "mine"), { recursive: true });
  writeFileSync(join(repo, ".agents", "skills", "mine", "SKILL.md"), "# mine\n");
  const status = window.getByRole("status", { name: "Skill setup" });
  await expect(status).toContainText("Skill setup: modified");
  await expect(status).toContainText("Core skill triage is not installed.");
  await expect(status).not.toContainText("Additional skills");

  // A modified setup nobody has judged asks what to do; accepting the deviations silences it.
  const dialog = window.getByRole("dialog", { name: "Modified skill setup" });
  await expect(dialog).toContainText("Core skill triage is not installed.");
  await dialog.getByRole("button", { name: "Accept deviations" }).click();
  await expect(dialog).toBeHidden();

  await app.close();
});
