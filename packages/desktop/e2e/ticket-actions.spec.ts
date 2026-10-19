import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\nBuild it.\n`;
const CART = ".scratch/shop/issues/02-cart.md";

/** A committed repo with a ready ticket shop/02 and shop/03, which 02 blocks. */
function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-actions-"));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
    [CART]: ticket("Build the cart", "Type: task", "Status: ready-for-agent"),
    ".scratch/shop/issues/03-pay.md": ticket(
      "Take payments",
      "Type: task",
      "Status: ready-for-agent",
      "Blocked by: 02",
    ),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.name", "Test"],
    ["config", "user.email", "test@example.com"],
    ["config", "commit.gpgsign", "false"],
    ["add", "."],
    ["commit", "-q", "-m", "Fixture"],
  ]) {
    git(repo, ...args);
  }
  return repo;
}

const git = (repo: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();

/**
 * Claims a ticket the way a session outside Dryland would, with the `dryland` the app ships, from a worktree on
 * branch `holder`: no ticket worktree, so the claim reads possibly stale.
 */
function claimOutside(repo: string, ref: string, holder: string): void {
  const worktree = `${repo}-${holder}`;
  if (!existsSync(worktree)) git(repo, "worktree", "add", "--quiet", "-b", holder, worktree);
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DRYLAND_SESSION_ID;
  // Outside any Agent CLI session, or the claim would be recorded in the session index and read as paused.
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.DRYLAND_PORT;
  delete env.DRYLAND_TOKEN;
  execFileSync(process.execPath, [resolve("out/main/dryland.js"), "ticket", "claim", ref], { cwd: worktree, env });
}

async function openProject(): Promise<{ app: ElectronApplication; window: Page; repo: string }> {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  await expect(window.getByText("Build the cart")).toBeVisible();
  return { app, window, repo };
}

/** Opens Settings from the File menu, as the user would, on the given tab. */
async function openSettings(app: ElectronApplication, window: Page, tab: string): Promise<Locator> {
  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "File");
    file?.submenu?.items.find((item) => item.label === "Settings...")?.click();
  });
  const dialog = window.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByRole("tab")).toHaveCount(6);
  await dialog.getByRole("tab", { name: tab }).click();
  return dialog;
}

test("claims, unblocks and resolves from a ticket at once, each shown in the live-events panel", async () => {
  const { app, window, repo } = await openProject();
  const panel = window.getByRole("log", { name: "Live events" });
  const actions = window.getByRole("region", { name: "Ticket actions" });
  await window.getByRole("button", { name: "Take payments" }).click();

  await actions.getByRole("button", { name: "Unblock from 02" }).click();
  await expect(panel).toContainText("ticket block shop/03");
  await expect(actions.getByRole("button", { name: "Unblock from 02" })).toBeHidden();

  await actions.getByRole("button", { name: "Claim" }).click();
  await expect(panel).toContainText("ticket claim shop/03");
  // Claimed from the app with no session, so no live session holds it.
  await expect(actions).toContainText("Claimed by main, possibly stale");

  await actions.getByRole("button", { name: "Resolve..." }).click();
  await actions.getByLabel("Answer").fill("Payments go through the shop's provider.");
  await actions.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(panel).toContainText("ticket resolve shop/03");
  await expect(window.getByRole("region", { name: "Answer" })).toContainText("Payments go through");

  // Started from the ticket, none of them asked, and each was committed.
  await expect(window.getByRole("dialog")).toHaveCount(0);
  expect(git(repo, "log", "-3", "--format=%s").split("\n")).toHaveLength(3);
  expect(git(repo, "status", "--porcelain")).toBe("");
  await app.close();
});

test("releases a possibly stale claim from the Tickets view only after a confirmation the user can turn off and back on", async () => {
  const { app, window, repo } = await openProject();
  const tickets = window.getByRole("region", { name: "Tickets" });
  const panel = window.getByRole("log", { name: "Live events" });
  const dialog = window.getByRole("dialog", { name: "Confirm write" });
  const release = tickets.getByRole("button", { name: "Release shop/02" });

  // A claim made outside Dryland: no live Dryland session holds it, and nothing releases it by itself.
  claimOutside(repo, "shop/02", "gone-session");
  await expect(tickets).toContainText("claimed by gone-session, possibly stale");
  await window.waitForTimeout(500);
  expect(readFileSync(join(repo, CART), "utf8")).toContain("Status: claimed");

  // The confirmation names the exact command; cancelling changes nothing.
  await release.click();
  await expect(dialog).toContainText("dryland ticket release shop/02");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(readFileSync(join(repo, CART), "utf8")).toContain("Status: claimed");

  // Confirming releases it; "do not ask again" stops the next one asking.
  await release.click();
  await dialog.getByLabel("Don't ask again for tracker metadata writes from a button").check();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(panel).toContainText("ticket release shop/02");
  await expect(release).toBeHidden();
  expect(readFileSync(join(repo, CART), "utf8")).toContain("Status: ready-for-agent");

  claimOutside(repo, "shop/02", "gone-session");
  await release.click();
  await expect(release).toBeHidden();
  await expect(dialog).toHaveCount(0);

  // Resetting brings the confirmation back.
  const settings = await openSettings(app, window, "Write confirmations");
  await expect(settings).toContainText("tracker metadata writes from a button");
  await settings.getByRole("button", { name: "Reset tracker metadata writes from a button" }).click();
  await settings.getByRole("button", { name: "Close" }).click();
  claimOutside(repo, "shop/02", "gone-session");
  await release.click();
  await expect(dialog).toBeVisible();
  await app.close();
});

test("with auto-commit off for the project, writes change the files without committing", async () => {
  const { app, window, repo } = await openProject();
  const head = git(repo, "rev-parse", "HEAD");
  const settings = await openSettings(app, window, "Tracker");
  await settings.getByLabel("Auto-commit tracker writes in this project").click();
  await expect(settings.getByRole("status")).toContainText("Overridden for this project: off");
  await settings.getByRole("button", { name: "Close" }).click();

  await window.getByRole("button", { name: "Build the cart" }).click();
  await window.getByRole("region", { name: "Ticket actions" }).getByRole("button", { name: "Claim" }).click();
  await expect(window.getByRole("log", { name: "Live events" })).toContainText("ticket claim shop/02");

  expect(readFileSync(join(repo, CART), "utf8")).toContain("Status: claimed");
  expect(git(repo, "rev-parse", "HEAD")).toBe(head);

  // The confirmation of a general button names the command as it will run.
  await window.getByRole("region", { name: "Tickets" }).getByRole("button", { name: "Release shop/02" }).click();
  await expect(window.getByRole("dialog", { name: "Confirm write" })).toContainText(
    "dryland ticket release shop/02 --no-commit",
  );
  await app.close();
});

test("Settings shows a project override over the global auto-commit, clears it, and says which tabs are still to come", async () => {
  const { app, window, repo } = await openProject();
  const head = git(repo, "rev-parse", "HEAD");
  const settings = await openSettings(app, window, "Tracker");

  // Global off, then a project override on: the override wins and says so.
  await settings.getByLabel("Auto-commit tracker writes", { exact: true }).click();
  await expect(settings.getByText("Following the global setting.")).toBeVisible();
  await settings.getByLabel("Auto-commit tracker writes in this project").click();
  await expect(settings.getByRole("status")).toContainText("Overridden for this project: on");
  await settings.getByRole("button", { name: "Close" }).click();
  await window.getByRole("button", { name: "Build the cart" }).click();
  await window.getByRole("region", { name: "Ticket actions" }).getByRole("button", { name: "Claim" }).click();
  await expect(window.getByRole("log", { name: "Live events" })).toContainText("ticket claim shop/02");
  expect(git(repo, "rev-parse", "HEAD")).not.toBe(head);

  // Clearing the override falls back to the global setting, which is off.
  await openSettings(app, window, "Tracker");
  await settings.getByRole("button", { name: "Clear override" }).click();
  await expect(settings.getByText("Following the global setting.")).toBeVisible();
  await expect(settings.getByLabel("Auto-commit tracker writes in this project")).not.toBeChecked();

  // The retention period defaults to 30 days and can be changed.
  await settings.getByRole("tab", { name: "General" }).click();
  const retention = settings.getByLabel("Keep sessions for");
  await expect(retention).toHaveValue("30");
  await retention.fill("7");
  await expect(retention).toHaveValue("7");

  await settings.getByRole("tab", { name: "Updates" }).click();
  await expect(settings).toContainText("arrives with ticket 58");
  await app.close();
});

/** Opens the New ticket dialog from the File menu and types a title. */
async function newTicket(app: ElectronApplication, window: Page, title: string): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "File");
    file?.submenu?.items.find((item) => item.label === "New Ticket...")?.click();
  });
  await window.getByRole("dialog", { name: "New ticket" }).getByLabel("Title").fill(title);
}

test("creates a ticket from the New ticket dialog, previewing the exact command and asking first", async () => {
  const { app, window, repo } = await openProject();
  const dialog = window.getByRole("dialog", { name: "New ticket" });
  const command = dialog.getByLabel("Command");

  await newTicket(app, window, "Refund orders");
  await expect(command).toHaveText('dryland ticket create --map shop --title "Refund orders" --type task --commit');
  // The preview follows every field.
  await dialog.getByLabel("Type").selectOption("grilling");
  await dialog.getByLabel("Question").fill("Who refunds?");
  await dialog.getByLabel("03 Take payments").check();
  await expect(command).toHaveText(
    'dryland ticket create --map shop --title "Refund orders" --type grilling --question "Who refunds?" --blocked-by 03 --commit',
  );

  await dialog.getByRole("button", { name: "Create ticket" }).click();
  const confirm = window.getByRole("dialog", { name: "Confirm write" });
  await expect(confirm).toContainText("--blocked-by 03 --commit");
  await confirm.getByRole("button", { name: "Confirm" }).click();

  // It appears in the tree under its map, written and committed through dryland.
  await expect(window.getByRole("region", { name: "Tickets" }).getByText("Refund orders")).toBeVisible();
  const created = readFileSync(join(repo, ".scratch/shop/issues/04-refund-orders.md"), "utf8");
  expect(created).toContain("Blocked by: 03");
  expect(created).toContain("Who refunds?");
  expect(git(repo, "log", "-1", "--format=%s")).toContain("shop/04");
  await app.close();
});

test("creates a ticket without asking once tracker metadata writes are no longer asked for", async () => {
  const { app, window } = await openProject();

  await newTicket(app, window, "Refund orders");
  await window.getByRole("button", { name: "Create ticket" }).click();
  const confirm = window.getByRole("dialog", { name: "Confirm write" });
  await confirm.getByLabel("Don't ask again for tracker metadata writes from a button").check();
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(window.getByRole("region", { name: "Tickets" }).getByText("Refund orders")).toBeVisible();

  // The "+" in the Tickets view opens the same dialog.
  await window.getByRole("button", { name: "New ticket" }).click();
  await window.getByRole("dialog", { name: "New ticket" }).getByLabel("Title").fill("Ship orders");
  await window.getByRole("button", { name: "Create ticket" }).click();
  await expect(window.getByRole("region", { name: "Tickets" }).getByText("Ship orders")).toBeVisible();
  await expect(window.getByRole("dialog", { name: "Confirm write" })).toHaveCount(0);
  await app.close();
});
