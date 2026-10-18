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
      // With STUB_WRITES_HISTORY, like the real CLI the stub files its session's history under the home.
      "const args = process.argv.slice(2);",
      "const launchedId = args[args.indexOf('--session-id') + 1];",
      "if (process.env.STUB_WRITES_HISTORY && args.includes('--session-id')) {",
      "  const { homedir } = require('node:os'); const { join } = require('node:path'); const fs = require('node:fs');",
      "  const dir = join(homedir(), '.claude', 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));",
      "  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(join(dir, launchedId + '.jsonl'), '{}');",
      "}",
      // Hooks report the CLI's own session id, as Claude Code's do; the other tests keep the fake's fixed one.
      "const sid = process.env.STUB_WRITES_HISTORY ? (args.includes('--session-id') ? launchedId : args[args.indexOf('--resume') + 1]) : undefined;",
      "console.log(`resume=${args.includes('--resume') ? args[args.indexOf('--resume') + 1] ?? 'picker' : 'no'}`);",
      "console.log(`session=${set('DRYLAND_SESSION_ID')} pane=${set('DRYLAND_PANE_KEY')} port=${set('DRYLAND_PORT')} token=${set('DRYLAND_TOKEN')}`);",
      "console.log(execSync('dryland ticket list', { encoding: 'utf8' }));",
      `const hooks = require(${JSON.stringify(FAKE_HOOKS)});`,
      "const settings = hooks.settingsFrom(process.argv.slice(2));",
      "process.stdin.setRawMode(true);",
      "process.stdin.on('data', (d) => {",
      "  const keys = d.toString();",
      "  if (keys.includes('\\r')) hooks.fire(settings, 'UserPromptSubmit', sid);",
      "  if (keys.includes('!')) ['PermissionRequest', 'Notification:permission_prompt'].forEach((e) => hooks.fire(settings, e, sid));",
      "  if (keys.includes('~')) hooks.fire(settings, 'Stop', sid);",
      "  if (keys.includes('#')) { hooks.fire(settings, 'SessionEnd', sid); process.exit(0); }",
      "  if (keys.includes('*')) setTimeout(() => { process.stdout.write('\\r\\nLATER-OUTPUT\\r\\n'); hooks.fire(settings, 'Stop', sid); }, 1500);",
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
  return { ...(await openProjectAt(env, repo, userData)), userData };
}

async function openProjectAt(env: Record<string, string>, repo: string, userData: string) {
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
  // An ended session leaves its claim paused, so the ticket offers to continue it; Start fresh is the second session.
  await window.getByRole("tab", { name: "shop/02", exact: true }).click();
  await window.getByRole("region", { name: "Paused session" }).getByRole("button", { name: "Start fresh" }).click();
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

test("lists sessions in the Sessions view's Hidden and Open panes and counts them in the status bar", async () => {
  const { app, window } = await openTicket(withPath((dirs) => [stubAgent(), ...dirs]));
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(window.locator(".xterm-rows:visible")).toContainText("/implement shop/02");

  await window.getByRole("button", { name: "Sessions", exact: true }).click();
  const hiddenPane = window.getByRole("region", { name: "Hidden sessions" });
  const openPane = window.getByRole("region", { name: "Open sessions" });
  const counts = window.getByLabel("Session counts");
  await expect(openPane.getByRole("button", { name: "Grill the cart" })).toBeVisible();
  await expect(counts).toHaveText("1 open · 0 hidden");
  // The focused session tab is the selected session: its state and branch are in the status bar.
  await expect(window.getByLabel("Selected session")).toContainText("shop/02-grill");

  await window.locator(".xterm:visible").click();
  await window.keyboard.type("!");
  await expect(window.locator(".activity-badge")).toHaveText("1");

  // Closing the tab hides the session: its map group starts collapsed, but a waiting session stays in view.
  await window.getByRole("button", { name: "Close Claude Code shop/02" }).click();
  await expect(counts).toHaveText("0 open · 1 hidden (1 waiting)");
  const group = hiddenPane.getByRole("button", { name: "Shop (1/1)" });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(group).toHaveAttribute("title", "1 waiting for you");
  await expect(hiddenPane.getByRole("img", { name: "Claude Code: waiting for you" })).toBeVisible();
  await expect(hiddenPane.getByRole("button", { name: "Stop Grill the cart" })).toBeAttached();

  // Grouping and collapsed panes are remembered, here across a reload of the window.
  await window.getByRole("region", { name: "Sessions" }).getByRole("button", { name: "More actions" }).click();
  await window.getByRole("radio", { name: "Group by none" }).check();
  await openPane.getByRole("button", { name: /Open/ }).click();
  await window.reload();
  await window.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(hiddenPane.getByRole("button", { name: /Shop/ })).toHaveCount(0);
  await expect(openPane.getByRole("button", { name: /Open/ })).toHaveAttribute("aria-expanded", "false");
  await openPane.getByRole("button", { name: /Open/ }).click();

  // Dragging the sash resizes the panes, and the size is remembered too.
  const sash = window.getByRole("separator", { name: "Resize Hidden and Paused" });
  const before = Number(await sash.getAttribute("aria-valuenow"));
  const box = (await sash.boundingBox())!;
  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await window.mouse.down();
  await window.mouse.move(box.x + box.width / 2, box.y - 100, { steps: 5 });
  await window.mouse.up();
  const share = await sash.getAttribute("aria-valuenow");
  expect(Number(share)).toBeLessThan(before);
  await window.reload();
  await window.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(sash).toHaveAttribute("aria-valuenow", share!);

  // Selecting a hidden session reopens its tab with what it printed.
  await hiddenPane.getByRole("button", { name: "Grill the cart", exact: true }).click();
  await expect(window.getByRole("tab", { name: "Claude Code shop/02" })).toHaveAttribute("aria-selected", "true");
  await expect(window.locator(".xterm-rows:visible")).toContainText("agent-ready");
  await expect(counts).toHaveText("1 open · 0 hidden");
  await expect(openPane.getByRole("listitem")).toHaveAttribute("aria-current", "true");

  // A Next-up marker on a waiting hidden session shows the session itself.
  await window.getByRole("button", { name: "Close Claude Code shop/02" }).click();
  await window.getByRole("button", { name: "Tickets", exact: true }).click();
  await window.getByRole("button", { name: /^Next up: .* is waiting for input\. Show the session\.$/ }).click();
  await expect(window.getByRole("tab", { name: "Claude Code shop/02" })).toHaveAttribute("aria-selected", "true");
  await app.close();
});

test("stops a session and resumes it from the paused box, in its worktree with the claim untouched", async () => {
  const home = mkdtempSync(join(tmpdir(), "dryland-e2e-home-"));
  const env = {
    ...withPath((dirs) => [stubAgent(), ...dirs]),
    HOME: home,
    USERPROFILE: home,
    STUB_WRITES_HISTORY: "1",
  };
  const { app, window, repo } = await openTicket(env);
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("/implement shop/02");
  const id = JSON.parse(readFileSync(join(repo, ".git/dryland/sessions.json"), "utf8")).items["shop/02"][0].sessionId;
  const claimed = readFileSync(join(repo, ".scratch/shop/issues/02-grill.md"), "utf8");

  // Idle, then stopped.
  await window.locator(".xterm:visible").click();
  await window.keyboard.type("~");
  await expect(window.getByRole("tablist").getByRole("img", { name: "Claude Code: idle" })).toBeVisible();
  await window.getByLabel("Session", { exact: true }).getByRole("button", { name: "Stop session" }).click();
  await expect(screen).toContainText("[session stopped]");

  // The ticket tab offers the paused session instead of the start box, with the pause badge on tab and row.
  await window.getByRole("tab", { name: "shop/02", exact: true }).click();
  const box = window.getByRole("region", { name: "Paused session" });
  await expect(box).toContainText("Paused");
  await expect(box).toContainText(id);
  // This run still holds the session's terminal, so its last output line shows (but not the stop notice).
  await expect(box.locator(".paused-last-line")).not.toHaveText("[session stopped]");
  await expect(box.locator(".paused-last-line")).toBeVisible();
  await expect(box).toContainText(`claude --resume ${id}`);
  await expect(window.getByRole("button", { name: "Start with Claude Code" })).toHaveCount(0);
  await expect(window.getByRole("tablist").getByRole("img", { name: "Claude Code: Paused" })).toBeVisible();

  // Resume continues the same CLI session in the same worktree; the claim is as it was.
  await box.getByRole("button", { name: "Resume" }).click();
  await expect(screen).toContainText("agent-ready cwd=shop-02-grill");
  await expect(screen).toContainText(`resume=${id}`);
  await expect(screen).not.toContainText("/implement shop/02");
  expect(readFileSync(join(repo, ".scratch/shop/issues/02-grill.md"), "utf8")).toBe(claimed);
  await app.close();
});

/** Starts the app again on the same project and settings, which it opens by itself. */
async function relaunch(env: Record<string, string>, userData: string) {
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`], env });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  return { app, window: await app.firstWindow() };
}

/** Clicks an item of the application menu, as the user would. */
const clickMenu = (app: Awaited<ReturnType<typeof electron.launch>>, menu: string, label: string) =>
  app.evaluate(
    ({ Menu }, [menuLabel, itemLabel]) => {
      const top = Menu.getApplicationMenu()?.items.find((item) => item.label === menuLabel);
      top?.submenu?.items.find((item) => item.label === itemLabel)?.click();
    },
    [menu, label],
  );

function resumeEnv() {
  const home = mkdtempSync(join(tmpdir(), "dryland-e2e-home-"));
  return {
    ...withPath((dirs) => [stubAgent(), ...dirs]),
    HOME: home,
    USERPROFILE: home,
    STUB_WRITES_HISTORY: "1",
  };
}

test("brings session tabs back after a restart, resuming a session only when its tab is first shown", async () => {
  const env = resumeEnv();
  const { app, window, repo, userData } = await openTicket(env);
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(window.locator(".xterm-rows:visible")).toContainText("agent-ready");
  const id = JSON.parse(readFileSync(join(repo, ".git/dryland/sessions.json"), "utf8")).items["shop/02"][0].sessionId;
  // Another tab after it, so it is not the one shown after the restart.
  await window.getByRole("button", { name: "Maps" }).click();
  await window.getByRole("button", { name: /^Shop/ }).click();
  await app.close();

  const second = await relaunch(env, userData);
  const tab = second.window.getByRole("tab", { name: "Claude Code shop/02" });
  await expect(tab).toBeVisible();
  await expect(second.window.getByRole("tab", { name: "shop", exact: true })).toHaveAttribute("aria-selected", "true");
  await second.window.waitForTimeout(1000);
  await expect(second.window.getByLabel("Session counts")).toHaveText("0 open · 0 hidden · 1 paused");

  await tab.click();
  await expect(second.window.locator(".xterm-rows:visible")).toContainText(`resume=${id}`);
  await expect(second.window.getByRole("tab", { name: "Claude Code shop/02" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(second.window.getByLabel("Session counts")).toHaveText("1 open · 0 hidden");
  await second.app.close();
});

test("Resume all resumes paused sessions hidden, on a map or everywhere, and a setting does it at start", async () => {
  const env = resumeEnv();
  const { app, window, userData } = await openTicket(env);
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(window.locator(".xterm-rows:visible")).toContainText("agent-ready");
  await window.getByRole("button", { name: "Close Claude Code shop/02" }).click();
  await app.close();

  // On the map: its paused session resumes and no tab opens for it.
  const second = await relaunch(env, userData);
  await expect(second.window.getByRole("tab")).toHaveCount(0);
  await second.window.getByRole("button", { name: "Maps" }).click();
  await second.window.getByRole("button", { name: /^Shop/ }).click();
  await expect(second.window.getByRole("region", { name: "Map sessions" })).toContainText("1 paused");
  await second.window.getByRole("button", { name: "Resume all on this map" }).click();
  await expect(second.window.getByLabel("Session counts")).toHaveText("0 open · 1 hidden");
  await expect(second.window.getByRole("button", { name: "Resume all on this map" })).toHaveCount(0);
  await expect(second.window.getByRole("tab")).toHaveCount(2); // the ticket and the map, none for the session
  await second.app.close();

  // From the Sessions menu: the same, for every map.
  const third = await relaunch(env, userData);
  await expect(third.window.getByLabel("Session counts")).toHaveText("0 open · 0 hidden · 1 paused");
  // The Sessions view lists it in the Paused pane; the menu resumes it, and the pane empties.
  await third.window.getByRole("button", { name: "Sessions", exact: true }).click();
  const pausedPane = third.window.getByRole("region", { name: "Paused sessions" });
  await expect(pausedPane.getByRole("button", { name: /Shop/ })).toBeVisible();
  await clickMenu(third.app, "Sessions", "Resume All Paused Sessions");
  await expect(third.window.getByLabel("Session counts")).toHaveText("0 open · 1 hidden");
  await expect(third.window.getByRole("tab", { name: /Claude Code/ })).toHaveCount(0);
  await expect(pausedPane).toContainText("No paused sessions.");

  // With the setting on, the next start does it by itself.
  await clickMenu(third.app, "Sessions", "Resume Sessions on Start");
  await third.app.close();
  const fourth = await relaunch(env, userData);
  await expect(fourth.window.getByLabel("Session counts")).toHaveText("0 open · 1 hidden");
  await fourth.app.close();
});
