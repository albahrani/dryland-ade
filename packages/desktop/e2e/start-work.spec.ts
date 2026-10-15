import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
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

/**
 * A fake `claude`: prints where it runs and what Dryland gave it, runs `dryland ticket list` the way an agent
 * would, then echoes each key it receives and reports an Enter as SUBMITTED.
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
      "console.log(`agent-ready cwd=${basename(process.cwd())}`);",
      "console.log(`session=${set('DRYLAND_SESSION_ID')} pane=${set('DRYLAND_PANE_KEY')} port=${set('DRYLAND_PORT')} token=${set('DRYLAND_TOKEN')}`);",
      "console.log(execSync('dryland ticket list', { encoding: 'utf8' }));",
      "process.stdin.setRawMode(true);",
      "process.stdin.on('data', (d) => {",
      "  const keys = d.toString();",
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

test("shows Claude Code as unavailable when it is not installed", async () => {
  // Every directory that holds a real `claude` is left off PATH.
  const names = windows ? ["claude.exe", "claude.cmd", "claude.bat"] : ["claude"];
  const env = withPath((dirs) => dirs.filter((dir) => !names.some((name) => existsSync(join(dir, name)))));
  const { app, window } = await openTicket(env);

  await expect(window.getByRole("button", { name: "Start with Claude Code" })).toBeDisabled();
  await expect(window.getByText("Claude Code is unavailable: `claude` is not on PATH.")).toBeVisible();
  await app.close();
});
