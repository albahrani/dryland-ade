import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/** `less` as a real full-screen program: from PATH, else the copy that ships with Git for Windows. */
function findLess(): string | null {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  try {
    const found = execFileSync(lookup, ["less"], { encoding: "utf8" }).split(/\r?\n/)[0];
    if (found) return found;
  } catch {
    // Not on PATH; fall through to Git's copy.
  }
  try {
    const execPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
    const bundled = resolve(execPath, "..", "..", "..", "usr", "bin", "less.exe");
    return existsSync(bundled) ? bundled : null;
  } catch {
    return null;
  }
}

const less = findLess();

test("less, a real full-screen program, repaints to the new size when the window is resized", async ({}, testInfo) => {
  test.skip(less === null, "less is not installed");
  const repo = mkdtempSync(join(tmpdir(), "dryland-e2e-repo-"));
  mkdirSync(join(repo, "docs/agents"), { recursive: true });
  writeFileSync(join(repo, "docs/agents/issue-tracker.md"), "# Issue tracker: Local markdown\n");
  execFileSync("git", ["init", "-q", repo]);
  const document = join(repo, "long.txt");
  const total = 300;
  writeFileSync(
    document,
    Array.from({ length: total }, (_, i) => `line ${String(i + 1).padStart(3, "0")}`).join("\n") + "\n",
  );

  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    // -M: a long prompt that names the visible lines ("lines 1-32/300"); -+F: never quit on a short file.
    env: { ...process.env, DRYLAND_SHELL: less!, DRYLAND_SHELL_ARGS: JSON.stringify(["-M", "-+F", document]) },
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  await window.getByRole("button", { name: "New terminal" }).click();

  // less shows rows - 1 lines of the file and a prompt on the last row. Returns that line count once the screen
  // is a consistent frame: the terminal's row count, the prompt's range and the visible text all agree.
  const rows = window.locator(".xterm-rows:visible > div");
  async function visibleLines(): Promise<number | null> {
    const lines = await rows.allInnerTexts();
    const prompt = /lines 1-(\d+)\/(\d+)/.exec(lines.at(-1) ?? "");
    if (prompt === null || Number(prompt[2]) !== total) return null;
    const shown = Number(prompt[1]);
    const consistent =
      shown === lines.length - 1 &&
      lines[0]?.trim() === "line 001" &&
      lines[shown - 1]?.trim() === `line ${String(shown).padStart(3, "0")}`;
    return consistent ? shown : null;
  }

  await expect.poll(visibleLines).not.toBeNull();
  const before = await visibleLines();
  await window.screenshot({ path: testInfo.outputPath("less-before-resize.png") });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 600));
  await expect
    .poll(async () => {
      const shown = await visibleLines();
      return shown !== null && shown < before!;
    })
    .toBe(true);
  await window.screenshot({ path: testInfo.outputPath("less-after-shrink.png") });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
  await expect.poll(visibleLines).toBe(before);
  await app.close();
});
