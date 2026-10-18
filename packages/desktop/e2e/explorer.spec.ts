import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nWhat?\n`;

const write = (root: string, file: string, content: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
};

/** A committed repo with ticket shop/02 (which has a worktree) and shop/03 (which has none). */
function fixture(): { repo: string; worktree: string } {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-e2e-explorer-")));
  write(repo, "docs/agents/issue-tracker.md", "# Issue tracker: Local markdown\n");
  write(repo, ".scratch/shop/map.md", "# Map: Shop\n\n## Not yet specified\n\nNothing.\n");
  write(repo, ".scratch/shop/issues/02-grill.md", ticket("Grill the cart", "Type: task", "Status: ready-for-agent"));
  write(repo, ".scratch/shop/issues/03-cart.md", ticket("Build the cart", "Type: task", "Status: ready-for-agent"));
  write(repo, ".gitignore", "node_modules/\n");
  write(repo, "src/greeting.ts", "export const greeting = 'hello';\n");
  write(repo, "node_modules/dep/index.js", "module.exports = 1;\n");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Fixture");
  const worktree = join(repo, "..", `${repo.split(/[\\/]/).at(-1)}-wt`);
  git(repo, "worktree", "add", "-q", "-b", "shop/02-grill", worktree);
  write(worktree, "src/greeting.ts", "export const greeting = 'hello world';\n");
  return { repo, worktree: realpathSync.native(worktree) };
}

test("shows the selected ticket's worktree, opens files and diffs read-only, and follows the disk", async () => {
  const { repo, worktree } = fixture();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  const explorer = window.getByRole("region", { name: "Explorer" });

  // With nothing selected, the main checkout.
  await expect(explorer.getByRole("heading", { name: "Main checkout (main)" })).toBeVisible();
  // Ignored directories are listed but cannot be opened, so they cost nothing.
  await expect(explorer.getByRole("button", { name: /node_modules/ })).toBeDisabled();

  // A ticket without a worktree keeps the main checkout.
  await window.getByRole("button", { name: "Build the cart" }).click();
  await expect(explorer.getByRole("heading", { name: "Main checkout (main)" })).toBeVisible();

  // A ticket with a worktree switches to it, and says which.
  await window.getByRole("button", { name: "Grill the cart" }).click();
  await expect(explorer.getByRole("heading", { name: "Worktree shop/02-grill" })).toBeVisible();
  await expect(explorer.getByRole("heading", { name: "Worktree shop/02-grill" })).toHaveAttribute("title", worktree);

  // The changed file shows in Changes; a file opens read-only with highlighting.
  await explorer.getByRole("button", { name: /^[▸▾] src$/ }).click();
  await explorer.getByRole("tree").getByRole("button", { name: "greeting.ts", exact: true }).click();
  const fileTab = window.getByRole("region", { name: "File src/greeting.ts" });
  await expect(fileTab).toContainText("hello world");
  await expect(fileTab.locator(".hljs-keyword").first()).toBeVisible();
  await expect(fileTab.getByRole("textbox")).toHaveCount(0);

  // The changed file opens as a diff.
  await explorer.getByRole("button", { name: "Open diff of src/greeting.ts" }).click();
  const diffTab = window.getByRole("region", { name: "Diff src/greeting.ts" });
  await expect(diffTab.locator(".diff-delete")).toContainText("hello';");
  await expect(diffTab.locator(".diff-add")).toContainText("hello world");

  // Files that change on disk reach the open tab and the tree.
  write(worktree, "src/greeting.ts", "export const greeting = 'goodbye';\n");
  write(worktree, "src/extra.ts", "export const extra = 1;\n");
  await expect(diffTab.locator(".diff-add")).toContainText("goodbye");
  await expect(explorer.getByRole("tree").getByRole("button", { name: "extra.ts", exact: true })).toBeVisible();
  await window.getByRole("tab", { name: "greeting.ts", exact: true }).click();
  await expect(window.getByRole("region", { name: "File src/greeting.ts" })).toContainText("goodbye");

  await app.close();
});
