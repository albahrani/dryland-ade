import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication, expect, type Page, test } from "@playwright/test";

// The claim, release and resolve buttons, and the New ticket and New map dialogs, with their confirmations, in a repo
// whose tickets live in the state store. The writes are events, so there are no commits to look at.

const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

const git = (repo: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();

const dryland = (repo: string, input: unknown, ...args: string[]) =>
  execFileSync(process.execPath, [CLI, ...args], {
    cwd: repo,
    env: { ...process.env },
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
  });

/** A store repo with a ready ticket shop/01 and shop/02, which 01 blocks. */
function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-actions-store-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "commit", "-q", "--allow-empty", "-m", "Fixture");
  dryland(repo, undefined, "init");
  dryland(repo, { effort: "shop", title: "Shop" }, "map", "create");
  dryland(repo, { effort: "shop", title: "Build the cart", type: "task", report: "Build it." }, "ticket", "create");
  dryland(
    repo,
    { effort: "shop", title: "Take payments", type: "task", report: "Pay.", blockedBy: ["shop/01"] },
    "ticket",
    "create",
  );
  return repo;
}

const show = (repo: string, ref: string) =>
  JSON.parse(dryland(repo, undefined, "ticket", "show", ref, "--json")) as {
    status: string;
    claim: { holder: string } | null;
    answer: string | null;
  };

/** Claims a ticket the way a session outside Dryland would, from a worktree on branch `holder`. */
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

test("on a store: claims, unblocks and resolves from a ticket at once, each shown on the ticket", async () => {
  const { app, window, repo } = await openProject();
  const actions = window.getByRole("region", { name: "Ticket actions" });
  await window.getByRole("button", { name: "Take payments" }).click();

  await actions.getByRole("button", { name: "Unblock from 01" }).click();
  await expect(actions.getByRole("button", { name: "Unblock from 01" })).toBeHidden();

  await actions.getByRole("button", { name: "Claim" }).click();
  // Claimed from the app with no session, so no live session holds it.
  await expect(actions).toContainText("Claimed by main, possibly stale");
  expect(show(repo, "shop/02")).toMatchObject({ status: "claimed", claim: { holder: "main" } });

  await actions.getByRole("button", { name: "Resolve..." }).click();
  // An over-cap summary is rejected with the cap stated, and the ticket stays claimed.
  await actions.getByLabel("Solution summary").fill("Payments go through the shop's provider. ".repeat(20));
  await actions.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(window.getByRole("alert").filter({ hasText: "summary cap is 600" })).toBeVisible();
  expect(show(repo, "shop/02")).toMatchObject({ status: "claimed" });

  await actions.getByLabel("Solution summary").fill("Payments go through the shop's provider.");
  await actions.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(window.getByRole("region", { name: "Solution summary" })).toContainText("Payments go through");

  // Started from the ticket, none of them asked, and nothing reached the repo itself.
  await expect(window.getByRole("dialog")).toHaveCount(0);
  expect(show(repo, "shop/02")).toMatchObject({ status: "resolved", claim: null });
  expect(git(repo, "status", "--porcelain")).toBe("");
  expect(git(repo, "log", "--format=%s")).toBe("Fixture");
  await app.close();
});

test("on a store: creates a ticket from the New ticket dialog, previewing the document and asking first", async () => {
  const { app, window, repo } = await openProject();
  const dialog = window.getByRole("dialog", { name: "New ticket" });
  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "File");
    file?.submenu?.items.find((item) => item.label === "New Ticket...")?.click();
  });
  await dialog.getByLabel("Title").fill("Refund orders");
  await dialog.getByLabel("Question").fill("Who refunds?");
  await dialog.getByLabel("01 Build the cart").check();
  await expect(dialog.getByLabel("Command")).toHaveText(
    'dryland ticket create < {"effort":"shop","title":"Refund orders","type":"task","report":"Who refunds?","blockedBy":["shop/01"]}',
  );

  await dialog.getByRole("button", { name: "Create ticket" }).click();
  const confirm = window.getByRole("dialog", { name: "Confirm write" });
  await expect(confirm).toContainText('"blockedBy":["shop/01"]');
  await confirm.getByRole("button", { name: "Confirm" }).click();

  await expect(window.getByRole("region", { name: "Tickets" }).getByText("Refund orders")).toBeVisible();
  expect(show(repo, "shop/03")).toMatchObject({ status: "open", title: "Refund orders", report: "Who refunds?" });
  // Nothing reached the repo itself.
  expect(git(repo, "status", "--porcelain")).toBe("");
  await app.close();
});

test("on a store: creates a map from the New map dialog, and its tab shows the destination", async () => {
  const { app, window, repo } = await openProject();
  await window.getByRole("button", { name: "Maps" }).click();
  await window.getByRole("button", { name: "New map" }).click();
  const dialog = window.getByRole("dialog", { name: "New map" });
  await dialog.getByLabel("Effort").fill("blog");
  await dialog.getByLabel("Title").fill("Blog");
  await dialog.getByLabel("Destination").fill("Publish weekly.");
  await expect(dialog.getByLabel("Command")).toHaveText(
    'dryland map create < {"effort":"blog","title":"Blog","destination":"Publish weekly."}',
  );

  await dialog.getByRole("button", { name: "Create map" }).click();
  await window.getByRole("dialog", { name: "Confirm write" }).getByRole("button", { name: "Confirm" }).click();

  await expect(window.getByRole("region", { name: "Maps" }).getByText("Blog")).toBeVisible();
  expect(JSON.parse(dryland(repo, undefined, "map", "show", "blog", "--json"))).toMatchObject({
    effort: "blog",
    map: { title: "Blog", destination: "Publish weekly." },
  });
  await app.close();
});

test("on a store: releases a possibly stale claim only after a confirmation the user can turn off", async () => {
  const { app, window, repo } = await openProject();
  const tickets = window.getByRole("region", { name: "Tickets" });
  const dialog = window.getByRole("dialog", { name: "Confirm write" });
  const release = tickets.getByRole("button", { name: "Release shop/01" });

  // A claim made outside Dryland: no live Dryland session holds it, and nothing releases it by itself.
  claimOutside(repo, "shop/01", "gone-session");
  await expect(tickets).toContainText("claimed by gone-session, possibly stale");

  // The confirmation names the exact command; cancelling changes nothing.
  await release.click();
  await expect(dialog).toContainText("dryland ticket release shop/01");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(show(repo, "shop/01").status).toBe("claimed");

  // Confirming releases it; "do not ask again" stops the next one asking.
  await release.click();
  await dialog.getByLabel("Don't ask again for tracker metadata writes from a button").check();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(release).toBeHidden();
  expect(show(repo, "shop/01")).toMatchObject({ status: "open", claim: null });

  claimOutside(repo, "shop/01", "gone-session");
  await release.click();
  await expect(release).toBeHidden();
  await expect(dialog).toHaveCount(0);
  await app.close();
});
