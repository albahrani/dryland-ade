import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const windows = process.platform === "win32";
const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\nBuild it.\n`;

/** A committed repo with a ready ticket shop/02, and an uncommitted edit only the main checkout has. */
function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-work-"));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
    ".scratch/shop/issues/02-grill.md": ticket("Grill the cart", "Type: task", "Status: ready-for-agent"),
    ".scratch/shop/issues/03-cart.md": ticket(
      "Build the cart",
      "Type: task",
      "Status: ready-for-agent",
      "Blocked by: 02",
    ),
    ".claude/skills/grilling/SKILL.md": "---\nname: grilling\n---\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "Fixture");
  writeFileSync(join(repo, ".scratch/shop/issues/03-cart.md"), ticket("Build the basket", "Type: task"));
  return repo;
}

/** The hook side of a fake Claude Code, shared with the CLI's contract tests. */
const FAKE_HOOKS = fileURLToPath(new URL("../../cli/test/fake-claude-hooks.mjs", import.meta.url)).replaceAll(
  "\\",
  "/",
);

/**
 * A fake `claude`: prints where it runs and what Dryland gave it, runs `dryland ticket list` the way an agent
 * would, then echoes each key it receives and reports an Enter as SUBMITTED. Like the real CLI it fires the hooks
 * of its `--settings`: UserPromptSubmit on Enter, a permission prompt on `!`, Stop on `~`, and on `#` SessionEnd
 * before it exits. On `*` it prints LATER-OUTPUT and fires Stop 1.5 seconds later, as an agent finishing a task
 * while nobody looks. None of those keys is in a pre-typed command.
 */
function stubAgent(): string {
  const dir = mkdtempSync(join(tmpdir(), "dryland-e2e-agent-"));
  const script = join(dir, "stub-agent.cjs");
  writeFileSync(
    script,
    [
      "const { execSync } = require('node:child_process');",
      "const { basename } = require('node:path');",
      "const set = (name) => (process.env[name] ? 'set' : 'missing');",
      "console.log(`agent-ready cwd=${basename(process.cwd())} pid=${process.pid}`);",
      "console.log(`session=${set('DRYLAND_SESSION_ID')} pane=${set('DRYLAND_PANE_KEY')} port=${set('DRYLAND_PORT')} token=${set('DRYLAND_TOKEN')}`);",
      "console.log(execSync('dryland ticket list', { encoding: 'utf8' }));",
      `const hooks = require(${JSON.stringify(FAKE_HOOKS)});`,
      "const settings = hooks.settingsFrom(process.argv.slice(2));",
      "process.stdin.setRawMode(true);",
      "process.stdin.on('data', (d) => {",
      "  const keys = d.toString();",
      "  if (keys.includes('\\r')) hooks.fire(settings, 'UserPromptSubmit');",
      "  if (keys.includes('!')) ['PermissionRequest', 'Notification:permission_prompt'].forEach((e) => hooks.fire(settings, e));",
      "  if (keys.includes('~')) hooks.fire(settings, 'Stop');",
      "  if (keys.includes('#')) { hooks.fire(settings, 'SessionEnd'); process.exit(0); }",
      "  if (keys.includes('*')) setTimeout(() => { process.stdout.write('\\r\\nLATER-OUTPUT\\r\\n'); hooks.fire(settings, 'Stop'); }, 1500);",
      "  process.stdout.write(keys.includes('\\r') ? '\\r\\nSUBMITTED\\r\\n' : keys);",
      "});",
    ].join("\n"),
  );
  if (windows) {
    writeFileSync(join(dir, "claude.cmd"), `@"${process.execPath}" "${script}" %*\r\n`);
  } else {
    writeFileSync(join(dir, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
    chmodSync(join(dir, "claude"), 0o755);
  }
  return dir;
}

/** This process's environment with `PATH` changed by `edit`, under whatever spelling the platform uses. */
function withPath(edit: (dirs: string[]) => string[]): Record<string, string> {
  const key = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  env[key] = edit((process.env[key] ?? "").split(delimiter)).join(delimiter);
  return env;
}

async function openTicket(env: Record<string, string>) {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`], env });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    // Quitting with sessions running asks first; the tests answer Quit unless they say otherwise.
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  await window.getByRole("button", { name: "Grill the cart" }).click();
  return { app, window, repo };
}

test("starts Claude Code on a ticket in its worktree with the next-step command typed, not submitted", async () => {
  const { app, window } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));

  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(window.getByRole("tab", { name: "Claude Code shop/02" })).toHaveAttribute("aria-selected", "true");

  const screen = window.locator(".xterm-rows:visible");
  // The CLI runs in the ticket's own worktree, with the session's identity in its environment.
  await expect(screen).toContainText("agent-ready cwd=shop-02-grill");
  await expect(screen).toContainText("session=set pane=set port=set token=set");
  // `dryland` is on PATH in the session and reads the main checkout, uncommitted edits included.
  await expect(screen).toContainText("Build the basket");
  // The next step for the ticket is typed once the CLI is quiet, and Enter is never pressed.
  await expect(screen).toContainText("/implement shop/02");
  await window.waitForTimeout(1000);
  await expect(screen).not.toContainText("SUBMITTED");

  // The session tab says what was recorded at spawn.
  const header = window.getByLabel("Session", { exact: true });
  await expect(header).toContainText("Claude Code");
  await expect(header).toContainText("shop/02-grill");
  await app.close();
});

test("shows the session's state from Claude Code's hooks on its tab and on its ticket", async () => {
  const { app, window } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("/implement shop/02");
  const badges = (state: string) => [
    window.getByRole("tablist").getByRole("img", { name: `Claude Code: ${state}` }),
    window.getByRole("region", { name: "Tickets" }).getByRole("img", { name: `Claude Code: ${state}` }),
  ];
  const expectState = async (state: string) => {
    for (const badge of badges(state)) {
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAttribute("title", `Claude Code: ${state}`);
    }
  };

  await expectState("launched");
  await window.locator(".xterm:visible").click();
  await window.keyboard.press("Enter");
  await expectState("working");
  await window.keyboard.type("!");
  await expectState("waiting for you");
  await window.keyboard.type("~");
  await expectState("idle");
  await window.keyboard.type("#");
  await expectState("ended");

  // A second session on the ticket: the ticket shows it over the ended one.
  const ticketBadge = (state: string) =>
    window.getByRole("region", { name: "Tickets" }).getByRole("img", { name: `Claude Code: ${state}` });
  await window.getByRole("tab", { name: "shop/02", exact: true }).click();
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(ticketBadge("launched")).toBeVisible();
  // Closing its tab hides the session; its CLI keeps running.
  await window.getByRole("button", { name: "Close Claude Code shop/02" }).last().click();
  await expect(ticketBadge("launched")).toBeVisible();
  // A reloaded window gets the sessions and their states back from the main process.
  await window.reload();
  await expect(ticketBadge("launched")).toBeVisible();
  await app.close();
});

/** Whether process `pid` still runs. */
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("closing a session tab hides the session, which keeps running and shows again with what it printed", async () => {
  const { app, window } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("/implement shop/02");
  const pid = Number(/pid=(\d+)/.exec(await screen.innerText())?.[1]);

  // The CLI prints and goes idle only after its tab is closed.
  await window.locator(".xterm:visible").click();
  await window.keyboard.type("*");
  await window.getByRole("button", { name: "Close Claude Code shop/02" }).click();
  await expect(window.getByRole("tab", { name: "Claude Code shop/02" })).toHaveCount(0);
  const ticketBadge = (state: string) =>
    window.getByRole("region", { name: "Tickets" }).getByRole("img", { name: `Claude Code: ${state}` });
  await expect(ticketBadge("idle")).toBeVisible();
  expect(alive(pid)).toBe(true);

  // The ticket shows the hidden session, marked for its unseen output, and shows it again.
  await window.getByRole("tab", { name: "shop/02", exact: true }).click();
  const live = window.getByRole("region", { name: "Live sessions" });
  await expect(live).toContainText("Claude Code shop/02");
  await expect(live.getByRole("img", { name: "Unseen output" })).toBeVisible();
  await live.getByRole("button", { name: "Show session" }).click();
  await expect(window.getByRole("tab", { name: "Claude Code shop/02" })).toHaveAttribute("aria-selected", "true");
  // Replayed: what it printed before and while hidden.
  await expect(screen).toContainText("agent-ready cwd=shop-02-grill");
  await expect(screen).toContainText("/implement shop/02*");
  await expect(screen).toContainText("LATER-OUTPUT");
  await expect(window.getByRole("tablist").getByRole("img", { name: "Unseen output" })).toHaveCount(0);
  // Input reaches the same process.
  await window.locator(".xterm:visible").click();
  await window.keyboard.type("y");
  await expect(screen).toContainText(/LATER-OUTPUT\s*y/);
  await app.close();
});

test("stops a session from its tab, asking first while it works, and keeps its claim and last state", async () => {
  const { app, window, repo } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("/implement shop/02");
  const pid = Number(/pid=(\d+)/.exec(await screen.innerText())?.[1]);
  const header = window.getByLabel("Session", { exact: true });
  const confirm = window.getByRole("dialog", { name: "Stop session" });

  // Working: Stop asks, and Cancel keeps it running.
  await window.locator(".xterm:visible").click();
  await window.keyboard.press("Enter");
  await expect(window.getByRole("tablist").getByRole("img", { name: "Claude Code: working" })).toBeVisible();
  await header.getByRole("button", { name: "Stop session" }).click();
  await expect(confirm).toContainText("It is still working");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(alive(pid)).toBe(true);

  // Idle with nothing unseen: Stop stops at once.
  await window.locator(".xterm:visible").click();
  await window.keyboard.type("~");
  await expect(window.getByRole("tablist").getByRole("img", { name: "Claude Code: idle" })).toBeVisible();
  await header.getByRole("button", { name: "Stop session" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(screen).toContainText("[session stopped]");
  await expect.poll(() => alive(pid)).toBe(false);
  await expect(header.getByRole("button", { name: "Stop session" })).toHaveCount(0);

  // The claim stays, and the session index still has the last state the hooks reported.
  expect(readFileSync(join(repo, ".scratch/shop/issues/02-grill.md"), "utf8")).toContain("Status: claimed");
  const index = JSON.parse(readFileSync(join(repo, ".git/dryland/sessions.json"), "utf8")) as unknown;
  expect(JSON.stringify(index)).toContain('"lastState":"idle"');
  await app.close();
});

test("quitting with a running session asks first, then stops it and keeps its claim", async () => {
  const { app, window, repo } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("/implement shop/02");
  const pid = Number(/pid=(\d+)/.exec(await screen.innerText())?.[1]);
  const claimed = () => ({
    // On disk, not at HEAD: without a git identity, as in CI containers, the claim is written but not committed.
    ticket: readFileSync(join(repo, ".scratch/shop/issues/02-grill.md"), "utf8"),
    commits: execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: repo, encoding: "utf8" }),
  });
  const before = claimed();
  expect(before.ticket).toContain("Status: claimed");

  // Cancel: the question lists the session, and nothing stops.
  await app.evaluate(({ app, dialog }) => {
    const asked: string[] = [];
    (globalThis as { asked?: string[] }).asked = asked;
    dialog.showMessageBox = async (...args: unknown[]) => {
      const options = args.at(-1) as { message: string; detail: string };
      asked.push(`${options.message}\n${options.detail}`);
      return { response: 1, checkboxChecked: false };
    };
    app.quit();
  });
  await expect
    .poll(() => app.evaluate(() => (globalThis as { asked?: string[] }).asked ?? []))
    .toEqual([expect.stringContaining("1 session is still running.")]);
  const [question] = await app.evaluate(() => (globalThis as { asked?: string[] }).asked ?? []);
  expect(question).toContain("• Claude Code shop/02 (launched) in shop/02-grill");
  await window.locator(".xterm:visible").click();
  await window.keyboard.type("x");
  await expect(screen).toContainText("/implement shop/02x");

  // Quit: the CLI is gone, and the claim and the branch's history are as they were.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  await app.close();
  await expect
    .poll(() => {
      try {
        process.kill(pid, 0);
        return "alive";
      } catch {
        return "gone";
      }
    })
    .toBe("gone");
  expect(claimed()).toEqual(before);
});

test("quitting with no running session asks nothing", async () => {
  const { app, window } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(window.locator(".xterm-rows:visible")).toContainText("/implement shop/02");
  // The CLI ends on its own: a session that has ended is nothing to ask about.
  await window.locator(".xterm:visible").click();
  await window.keyboard.type("#");
  await expect(window.getByRole("tablist").getByRole("img", { name: "Claude Code: ended" })).toBeVisible();
  // Any question would be answered Cancel and keep the app open.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  const closed = app.waitForEvent("close", { timeout: 10_000 });
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await closed;
});

test("shows Claude Code as unavailable when it is not installed", async () => {
  // Every directory that holds a real `claude` is left off PATH.
  const names = windows ? ["claude.exe", "claude.cmd", "claude.bat"] : ["claude"];
  const env = withPath((dirs) => dirs.filter((dir) => !names.some((name) => existsSync(join(dir, name)))));
  const { app, window } = await openTicket(env);

  await expect(window.getByRole("button", { name: "Start with Claude Code" })).toBeDisabled();
  await expect(window.getByText("Claude Code is unavailable: `claude` is not on PATH.")).toBeVisible();
  await app.close();
});

test("types any installed skill picked on a ticket instead of the recommended command", async () => {
  const { app, window } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));

  await window.getByRole("group", { name: "Start work" }).getByLabel("Skill").selectOption({ label: "/grilling" });
  await window.getByRole("button", { name: "Start with Claude Code" }).click();

  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("/grilling shop/02");
  await expect(screen).not.toContainText("/implement");
  await app.close();
});

test("continues a map from its stats card with /wayfinder <map> typed, in the map's own worktree", async () => {
  const { app, window } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));

  await window.getByRole("button", { name: "Maps" }).click();
  await window.getByRole("button", { name: /^Shop/ }).click();
  await window
    .getByRole("region", { name: "Shop statistics" })
    .getByRole("button", { name: "Continue map with Claude Code" })
    .click();

  await expect(window.getByRole("tab", { name: "Claude Code shop", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("agent-ready cwd=shop-scratch-wayfinder");
  await expect(screen).toContainText("/wayfinder shop");
  await window.waitForTimeout(1000);
  await expect(screen).not.toContainText("SUBMITTED");
  await app.close();
});

test("starts a new map with only an Agent CLI chosen, /wayfinder typed in a temporary worktree", async () => {
  const { app, window, repo } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));

  await window.getByRole("button", { name: "Maps" }).click();
  await window.getByRole("button", { name: "New map" }).click();
  const dialog = window.getByRole("dialog", { name: "New map" });
  await dialog.getByRole("button", { name: "Open Claude Code" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(window.getByRole("tab", { name: "Claude Code new map" })).toHaveAttribute("aria-selected", "true");
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("agent-ready cwd=new-map-scratch-wayfinder");
  await expect(screen).toContainText("/wayfinder");
  await window.waitForTimeout(1000);
  await expect(screen).not.toContainText("SUBMITTED");
  // Dryland wrote no map: the skill does, in its session.
  expect(execFileSync("git", ["status", "--porcelain", ".scratch"], { cwd: repo, encoding: "utf8" })).toBe(
    " M .scratch/shop/issues/03-cart.md\n",
  );
  await app.close();
});
