import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const ticket = (title: string) => `# ${title}\n\nType: task\nStatus: ready-for-agent\n\nBuild it.\n`;

/** A committed repo with one ready ticket, shop/02, so `dryland ticket claim` can commit. */
function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-live-"));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
    ".scratch/shop/issues/02-cart.md": ticket("Build the cart"),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  git("add", ".");
  git("commit", "-q", "-m", "Fixture");
  return repo;
}

/** Runs the `dryland` the app ships, from a terminal outside the app: it finds the app through the lock file. */
function dryland(repo: string, args: string[], env: Record<string, string> = {}): void {
  const cli = resolve("out/main/dryland.js");
  const outside = { ...process.env, ...env };
  delete outside.DRYLAND_PORT;
  delete outside.DRYLAND_TOKEN;
  execFileSync(process.execPath, [cli, ...args], { cwd: repo, env: outside, stdio: "pipe" });
}

test("shows ticket changes and session events from outside terminals, in a panel that remembers its mode", async () => {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const launch = () => electron.launch({ args: [".", `--user-data-dir=${userData}`] });

  const first = await launch();
  await first.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  let window = await first.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  await expect(window.getByText("Build the cart")).toBeVisible();
  const panel = window.getByRole("log", { name: "Live events" });
  await expect(panel).toContainText("No live events yet.");

  // A claim in an outside terminal refreshes the tree and shows a line in the panel.
  dryland(repo, ["ticket", "claim", "shop/02"], { DRYLAND_SESSION_ID: "session-a" });
  await expect(window.getByRole("region", { name: "Tickets" }).getByRole("img", { name: "In progress" })).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel).toContainText("ticket claim shop/02");

  // Session events show too, newest last.
  dryland(repo, ["status", "session.waiting"], { DRYLAND_SESSION_ID: "session-b" });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("listitem").last()).toContainText("session.waiting");
  await expect(panel.getByRole("listitem").last()).toContainText("session-b");

  // One line shows only the newest event; hidden shows nothing; the status bar brings it back.
  await window.getByRole("button", { name: "One line" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel).toContainText("session.waiting");
  await window.getByRole("button", { name: "Hide live events" }).click();
  await expect(panel).toBeHidden();
  await window.getByRole("button", { name: "Show live events" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await window.getByRole("button", { name: "Expand" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await window.getByRole("button", { name: "One line" }).click();
  await first.close();

  // After a restart the mode is remembered and no event survived.
  const second = await launch();
  window = await second.firstWindow();
  await expect(window.getByText("Build the cart")).toBeVisible();
  await expect(window.getByRole("button", { name: "One line" })).toHaveAttribute("aria-pressed", "true");
  await expect(window.getByRole("log", { name: "Live events" })).toContainText("No live events yet.");
  await second.close();

  // Quitting removes the lock file, so `dryland` stops trying to reach the app.
  expect(existsSync(join(process.env.DRYLAND_APP_DIR ?? "", "live.json"))).toBe(false);
});
