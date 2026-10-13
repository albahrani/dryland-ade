import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nWhat?\n`;

function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-repo-"));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Destination\n\nSell things.\n\n## Not yet specified\n\n- Payments\n",
    ".scratch/shop/issues/01-done.md": ticket("Set up repo", "Type: task", "Status: resolved"),
    ".scratch/shop/issues/02-grill.md": ticket("Grill the cart", "Type: grilling", "Status: ready-for-agent"),
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
  execFileSync("git", ["init", "-q", repo]);
  return repo;
}

test("opens a repo, shows its tickets tree, refreshes on disk changes and reopens the project", async () => {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const launch = () => electron.launch({ args: [".", `--user-data-dir=${userData}`] });

  // First run: open the project through the folder picker, which the test answers.
  const first = await launch();
  await first.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  let window = await first.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  await expect(window.getByRole("button", { name: /[▾▸] Shop/ })).toBeVisible();
  await expect(window.getByText("Grill the cart")).toBeVisible();
  await expect(window.getByText("blocked by 02")).toBeVisible();
  await expect(window.getByRole("img", { name: "Ready" }).first()).toHaveAttribute("title", "Ready");
  await expect(window.getByRole("complementary", { name: "Legend" })).toBeVisible();

  // Done tickets are folded into one line that expands.
  await expect(window.getByText("Set up repo")).toHaveCount(0);
  await window.getByRole("button", { name: /1 done/ }).click();
  await expect(window.getByText("Set up repo")).toBeVisible();

  // Editing a ticket file on disk updates the tree without a restart.
  writeFileSync(
    join(repo, ".scratch/shop/issues/02-grill.md"),
    ticket("Grill the cart", "Type: grilling", "Status: resolved"),
  );
  await expect(window.getByRole("button", { name: /2 done/ })).toBeVisible();
  await expect(window.getByText("blocked by 02")).toHaveCount(0);

  await window.getByRole("button", { name: "Dismiss legend" }).click();
  await first.close();

  // Second run: same user data, no picker. The project is back and the legend stays dismissed.
  const second = await launch();
  window = await second.firstWindow();
  await expect(window.getByRole("button", { name: /[▾▸] Shop/ })).toBeVisible();
  await expect(window.getByText("Build the cart")).toBeVisible();
  await expect(window.getByRole("complementary", { name: "Legend" })).toHaveCount(0);
  await second.close();
});

test("shows maps with progress, opens tickets and maps in tabs, follows disk edits and restores tabs", async () => {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const launch = () => electron.launch({ args: [".", `--user-data-dir=${userData}`] });

  const first = await launch();
  await first.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  let window = await first.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();

  // The Maps view: one row per map with a bar matching its tickets and fog, and a stats card on selection.
  await window.getByRole("button", { name: "Maps" }).click();
  await expect(window.getByRole("img", { name: "1 done, 1 ready, 1 blocked, 1 fog" })).toBeVisible();
  await window.getByRole("button", { name: /^Shop/ }).click();
  const card = window.getByRole("region", { name: "Shop statistics" });
  await expect(card.getByText("Total")).toBeVisible();
  await expect(window.getByRole("tab", { name: "shop" })).toHaveAttribute("aria-selected", "true");
  await expect(window.getByText("Sell things.")).toBeVisible();

  // A ticket opens in a tab with a details header that collapses; opening it again focuses the same tab.
  await window.getByRole("button", { name: "Tickets" }).click();
  await window.getByRole("button", { name: "Grill the cart" }).click();
  await expect(window.getByRole("tab")).toHaveCount(2);
  await expect(window.getByText("Claimant")).toBeVisible();
  await expect(window.getByText("What?")).toBeVisible();
  await window.getByRole("button", { name: /shop\/02 Grill the cart/ }).click();
  await expect(window.getByText("Claimant")).toHaveCount(0);
  // A collapsed header stays collapsed when the user switches away and back.
  await window.getByRole("tab", { name: "shop", exact: true }).click();
  await window.getByRole("tab", { name: "shop/02" }).click();
  await expect(window.getByText("Claimant")).toHaveCount(0);
  await window.getByRole("button", { name: /shop\/02 Grill the cart/ }).click();
  await expect(window.getByText("Claimant")).toBeVisible();
  await window.getByRole("tab", { name: "shop", exact: true }).click();
  await window.getByRole("button", { name: "Grill the cart" }).click();
  await expect(window.getByRole("tab")).toHaveCount(2);
  await expect(window.getByRole("tab", { name: "shop/02" })).toHaveAttribute("aria-selected", "true");

  // Content in an open tab follows the file on disk, including its comments.
  writeFileSync(
    join(repo, ".scratch/shop/issues/02-grill.md"),
    `${ticket("Grill the cart", "Type: grilling", "Status: ready-for-agent")}\n## Comments\n\nA fresh remark.\n`,
  );
  await expect(window.getByText("A fresh remark.")).toBeVisible();
  await first.close();

  // After a restart the same tabs are open, with the same tab focused.
  const second = await launch();
  window = await second.firstWindow();
  await expect(window.getByRole("tab")).toHaveCount(2);
  await expect(window.getByRole("tab", { name: "shop/02" })).toHaveAttribute("aria-selected", "true");
  await expect(window.getByText("A fresh remark.")).toBeVisible();
  await second.close();
});

test("runs terminal sessions in tabs: input, output, resize, independence, and no process left behind", async () => {
  const repo = fixtureRepo();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  // A stub shell: node prints a banner with its pid, echoes each input line, and reports when its terminal width changes.
  const stub = join(mkdtempSync(join(tmpdir(), "dryland-e2e-shell-")), "stub-shell.mjs");
  writeFileSync(
    stub,
    [
      "console.log(`stub-shell-ready pid=${process.pid} cwd=${process.cwd()}`);",
      "process.stdin.on('data', (d) => console.log(`got: ${d.toString().trim()}`));",
      "let cols = process.stdout.columns;",
      "setInterval(() => {",
      "  process.stdout._refreshSize();",
      "  if (process.stdout.columns !== cols) console.log(`resized cols=${(cols = process.stdout.columns)}`);",
      "}, 100);",
    ].join("\n"),
  );
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env: { ...process.env, DRYLAND_SHELL: process.execPath, DRYLAND_SHELL_ARGS: JSON.stringify([stub]) },
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await expect(window.getByRole("button", { name: "New terminal" })).toBeDisabled();
  await window.getByRole("button", { name: "Open project..." }).click();

  // A session tab runs the shell in the project's checkout and shows its output.
  await window.getByRole("button", { name: "New terminal" }).click();
  await expect(window.getByRole("tab", { name: "Terminal 1" })).toHaveAttribute("aria-selected", "true");
  const screen = window.locator(".xterm-rows:visible");
  await expect(screen).toContainText("stub-shell-ready");
  await expect(screen).toContainText(basename(repo));
  const firstPid = /pid=(\d+)/.exec(await screen.innerText())?.[1];
  expect(firstPid).toBeDefined();

  // Typed input reaches the process and its answer comes back.
  await window.locator(".xterm:visible").click();
  await window.keyboard.type("hello");
  await window.keyboard.press("Enter");
  await expect(screen).toContainText("got: hello");

  // Resizing the window resizes the PTY: the process notices its new width.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 600));
  await expect(screen).toContainText("resized cols=");

  // A second session is independent of the first.
  await window.getByRole("button", { name: "New terminal" }).click();
  await expect(window.getByRole("tab", { name: "Terminal 2" })).toHaveAttribute("aria-selected", "true");
  await expect(screen).toContainText("stub-shell-ready");
  await expect(screen).not.toContainText("got: hello");
  const secondPid = /pid=(\d+)/.exec(await screen.innerText())?.[1];
  expect(secondPid).not.toBe(firstPid);
  await window.getByRole("tab", { name: "Terminal 1" }).click();
  await expect(screen).toContainText("got: hello");

  // Closing the app leaves no process behind.
  await app.close();
  for (const pid of [firstPid, secondPid]) {
    await expect
      .poll(() => {
        try {
          process.kill(Number(pid), 0);
          return "alive";
        } catch {
          return "gone";
        }
      })
      .toBe("gone");
  }
});
