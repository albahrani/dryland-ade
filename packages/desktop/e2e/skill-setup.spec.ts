import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

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

  // The Skills tab shows the accepted deviations; revoking them brings the dialog back.
  await openSettings(app, window, "Skills");
  const settings = window.getByRole("dialog", { name: "Settings" });
  await expect(settings).toContainText("Skill setup: modified");
  await expect(settings).toContainText("Core skill triage is not installed.");
  await expect(settings).toContainText("Deviations accepted.");
  await settings.getByRole("button", { name: "Revoke" }).click();
  await expect(dialog).toBeVisible();

  await app.close();
});

async function openSettings(app: ElectronApplication, window: Page, tab: string): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "File");
    file?.submenu?.items.find((item) => item.label === "Settings...")?.click();
  });
  await window.getByRole("dialog", { name: "Settings" }).getByRole("tab", { name: tab }).click();
}

test("the Agent CLIs tab lists the adapters and installs, inspects and removes Copilot's hooks", async () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "dryland-e2e-agent-clis-")));
  execFileSync("git", ["init", "-q", repo]);
  const copilotHome = mkdtempSync(join(tmpdir(), "dryland-e2e-copilot-home-"));
  const config = '{\n  "trustedFolders": []\n}\n';
  writeFileSync(join(copilotHome, "config.json"), config);
  const hookFile = join(copilotHome, "hooks", "dryland.json");
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env: { ...process.env, COPILOT_HOME: copilotHome },
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  await openSettings(app, window, "Agent CLIs");
  const settings = window.getByRole("dialog", { name: "Settings" });

  // Every adapter, with its tier.
  await expect(settings.getByRole("listitem", { name: "Claude Code" })).toContainText("First-class");
  await expect(settings.getByRole("listitem", { name: "Codex CLI" })).toContainText("Best-effort");
  await expect(settings.getByRole("listitem", { name: "GitHub Copilot CLI" })).toContainText("Hook file not installed");

  // Auto-submit is set here, globally and for this project.
  const global = settings.getByLabel("Submit the pre-typed command (auto-submit)");
  await global.click();
  await expect(global).toBeChecked();
  const perProject = settings.getByLabel(/^Auto-submit in/);
  await perProject.selectOption("off");
  await expect(perProject).toHaveValue("off");

  // The first install asks; cancelling writes nothing, confirming writes the hook file.
  const confirm = window.getByRole("dialog", { name: "Confirm write" });
  await settings.getByRole("button", { name: "Install hooks for GitHub Copilot CLI" }).click();
  await expect(confirm).toContainText("trustedFolders");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(existsSync(hookFile)).toBe(false);
  await settings.getByRole("button", { name: "Install hooks for GitHub Copilot CLI" }).click();
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(settings.getByRole("listitem", { name: "GitHub Copilot CLI" })).toContainText("Hook file installed");
  expect(existsSync(hookFile)).toBe(true);

  // Inspect shows exactly what was written.
  await settings.getByRole("button", { name: "Inspect hooks for GitHub Copilot CLI" }).click();
  await expect(settings.getByLabel("Hook file contents")).toContainText("dryland agent-hook copilot-cli");
  expect(readFileSync(hookFile, "utf8")).toContain("dryland agent-hook copilot-cli");

  await settings.getByRole("button", { name: "Remove hooks for GitHub Copilot CLI" }).click();
  await expect(settings.getByRole("listitem", { name: "GitHub Copilot CLI" })).toContainText("Hook file not installed");
  expect(existsSync(hookFile)).toBe(false);
  expect(readFileSync(join(copilotHome, "config.json"), "utf8")).toBe(config);
  await app.close();
});
