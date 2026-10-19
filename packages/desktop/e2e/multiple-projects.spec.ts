import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

const windows = process.platform === "win32";
const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\nBuild it.\n`;

/** A committed repo called `name` with one ready ticket, `title`, on map `map`. */
function fixtureRepo(name: string, map: string, title: string): string {
  const repo = join(mkdtempSync(join(tmpdir(), "dryland-e2e-projects-")), name);
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    [`.scratch/${map}/map.md`]: `# Map: ${map}\n\n## Not yet specified\n\nNothing.\n`,
    [`.scratch/${map}/issues/02-grill.md`]: ticket(title, "Type: task", "Status: ready-for-agent"),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "Fixture");
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

/**
 * Starts the app. Its `close()` quits like the user does: with sessions running, the quit dialog asks first, and
 * the tests answer Quit unless they say otherwise.
 */
async function launchApp(env: Record<string, string>, userData: string) {
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`], env });
  const close = app.close.bind(app);
  app.close = async () => {
    const closed = app.waitForEvent("close");
    void app.evaluate(({ app }) => app.quit()).catch(() => {});
    const quit = (await app.firstWindow())
      .getByRole("dialog", { name: "Quit Dryland" })
      .getByRole("button", { name: "Quit", exact: true });
    await Promise.race([closed, quit.click().catch(() => {})]);
    await closed.catch(() => {});
    await close().catch(() => {});
  };
  return app;
}


/** Makes the next "Open project..." pick `path`. */
const pickNext = (app: Awaited<ReturnType<typeof launchApp>>, path: string) =>
  app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, path);

async function openFromMenu(app: Awaited<ReturnType<typeof launchApp>>, window: Page, repo: string) {
  await pickNext(app, repo);
  await window.getByRole("button", { name: /^(Open project\.\.\.|.* ▾)$/ }).click();
  const open = window.getByRole("menuitem", { name: "Open project..." });
  if (await open.isVisible()) await open.click();
}

const counts = (window: Page) => window.getByLabel("Session counts");

test("keeps several projects open, each with its own tabs and sessions, and restores them on restart", async () => {
  const env = withPath((dirs) => [stubAgent(), ...dirs]);
  const shop = fixtureRepo("shop", "shop", "Grill the cart");
  const blog = fixtureRepo("blog", "blog", "Write the intro");
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await launchApp(env, userData);
  const window = await app.firstWindow();

  await openFromMenu(app, window, shop);
  await window.getByRole("button", { name: "Grill the cart" }).click();
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(window.locator(".xterm-rows:visible")).toContainText("agent-ready cwd=shop-02-grill");
  await expect(counts(window)).toContainText("1 open");

  // A second project opens beside the first: its tickets show, the first one's session does not count.
  await openFromMenu(app, window, blog);
  await expect(window.getByText("Write the intro")).toBeVisible();
  await expect(window.getByText("Grill the cart")).toBeHidden();
  await expect(window.getByRole("tab")).toHaveCount(0);
  await expect(counts(window)).toContainText("0 open · 0 hidden");
  await expect(window.getByRole("button", { name: "blog ▾" })).toBeVisible();

  // The All Projects dialog lists both with their live sessions and next-up items.
  await window.getByRole("button", { name: "blog ▾" }).click();
  await window.getByRole("menuitem", { name: "All projects..." }).click();
  const dialog = window.getByRole("dialog", { name: "All projects" });
  await expect(dialog.getByRole("listitem").filter({ hasText: "shop" })).toContainText("1 live session");
  await expect(dialog.getByRole("listitem").filter({ hasText: "blog" })).toContainText("0 live sessions");
  await expect(dialog.getByRole("listitem").filter({ hasText: "blog" })).toContainText("Local markdown");
  await expect(dialog.getByRole("listitem").filter({ hasText: "blog" })).toContainText("Next up: blog/02");

  // Opening one from the dialog switches back to it, tab and running session as they were.
  await dialog.getByRole("button", { name: "Open shop" }).click();
  await expect(window.getByRole("tab", { name: "Claude Code shop/02" })).toHaveAttribute("aria-selected", "true");
  await expect(window.locator(".xterm-rows:visible")).toContainText("agent-ready cwd=shop-02-grill");
  await expect(counts(window)).toContainText("1 open");
  // The session still answers while its project is shown again, and was never interrupted by the switches.
  await window.locator(".xterm:visible").click();
  await window.keyboard.press("Enter");
  await expect(window.getByRole("tablist").getByRole("img", { name: "Claude Code: working" })).toBeVisible();

  // Switching with the widget works too.
  await window.getByRole("button", { name: "shop ▾" }).click();
  await window.getByRole("menuitemradio", { name: "blog" }).click();
  await expect(window.getByText("Write the intro")).toBeVisible();

  // The open projects, and the one shown, come back after a restart.
  await app.close();
  const again = await launchApp(env, userData);
  const next = await again.firstWindow();
  await expect(next.getByText("Write the intro")).toBeVisible();
  await next.getByRole("button", { name: "blog ▾" }).click();
  await expect(next.getByRole("menuitemradio", { name: "shop" })).toBeVisible();
  await expect(next.getByRole("menuitemradio", { name: "blog" })).toHaveAttribute("aria-checked", "true");
  await again.close();
});

test("closing a project lists its live sessions first, then ends them and shows the next project", async () => {
  const env = withPath((dirs) => [stubAgent(), ...dirs]);
  const shop = fixtureRepo("shop", "shop", "Grill the cart");
  const blog = fixtureRepo("blog", "blog", "Write the intro");
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await launchApp(env, userData);
  const window = await app.firstWindow();
  await openFromMenu(app, window, shop);
  await window.getByRole("button", { name: "Grill the cart" }).click();
  await window.getByRole("button", { name: "Start with Claude Code" }).click();
  await expect(window.locator(".xterm-rows:visible")).toContainText("agent-ready cwd=shop-02-grill");
  await openFromMenu(app, window, blog);

  await window.getByRole("button", { name: "blog ▾" }).click();
  await window.getByRole("menuitem", { name: "All projects..." }).click();
  const dialog = window.getByRole("dialog", { name: "All projects" });
  await dialog.getByRole("button", { name: "Close shop" }).click();
  const confirm = dialog.getByRole("alertdialog", { name: "Close project" });
  await expect(confirm.getByRole("list", { name: "Sessions that stop" })).toContainText("Claude Code shop/02");
  await confirm.getByRole("button", { name: "Close project" }).click();

  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Done" }).click();
  await window.getByRole("button", { name: "blog ▾" }).click();
  await expect(window.getByRole("menuitemradio", { name: "shop" })).toBeHidden();
  // Nothing runs any more, so quitting does not ask.
  await app.close();
});
