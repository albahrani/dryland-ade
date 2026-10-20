import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nWhat?\n`;

const write = (root: string, file: string, content: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

/** A committed repo with ticket shop/02, whose worktree holds one uncommitted edit. */
function fixture(): { repo: string; worktree: string } {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-e2e-merge-")));
  write(repo, "docs/agents/issue-tracker.md", "# Issue tracker: Local markdown\n");
  write(repo, ".scratch/shop/map.md", "# Map: Shop\n\n## Not yet specified\n\nNothing.\n");
  write(repo, ".scratch/shop/issues/02-grill.md", ticket("Grill the cart", "Type: task", "Status: ready-for-agent"));
  write(repo, "src/greeting.ts", "export const greeting = 'hello';\n");
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

test("merges from the Merge section: blocked while dirty, kept while the ticket is open, pruned once it is resolved", async () => {
  const { repo, worktree } = fixture();
  const userData = mkdtempSync(join(tmpdir(), "dryland-e2e-user-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  const window = await app.firstWindow();
  await window.getByRole("button", { name: "Open project..." }).click();
  await window.getByRole("button", { name: "Grill the cart" }).click();
  const merge = window.getByRole("region", { name: "Merge" });
  const mergeButton = merge.getByRole("button", { name: "Merge", exact: true });

  // A dirty worktree blocks the merge, and the section says why.
  await expect(merge.getByRole("list", { name: "Dry run" })).toContainText("the worktree has uncommitted changes");
  await expect(mergeButton).toBeDisabled();
  await expect(merge).toContainText("The merge is disabled");

  // Committed, the only thing left is a hint: the ticket is not resolved.
  git(worktree, "commit", "-q", "-a", "-m", "Say hello world");
  await expect(merge.getByRole("list", { name: "Dry run" })).toContainText("shop/02 is not resolved");
  await expect(mergeButton).toBeEnabled();

  // Merge with cleanup: the merge lands, the worktree stays because the ticket is open.
  await merge.getByLabel(/Remove worktree and branch afterwards/).check();
  await mergeButton.click();
  await expect(merge.getByRole("status")).toContainText("Merged into main. Worktree kept:");
  expect(readFileSync(join(repo, "src/greeting.ts"), "utf8")).toContain("hello world");
  expect(existsSync(worktree)).toBe(true);

  // Pruning asks first, can be cancelled, and is refused naming the open ticket.
  await merge.getByRole("button", { name: "Prune worktree…" }).click();
  await merge.getByRole("button", { name: "Cancel" }).click();
  expect(existsSync(worktree)).toBe(true);
  await merge.getByRole("button", { name: "Prune worktree…" }).click();
  await merge.getByRole("button", { name: "Confirm prune" }).click();
  await expect(merge.getByRole("alert")).toContainText("not resolved");
  expect(existsSync(worktree)).toBe(true);

  // Once the ticket is resolved, the confirmed prune removes worktree and branch.
  const file = join(repo, ".scratch/shop/issues/02-grill.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("Status: ready-for-agent", "Status: resolved"));
  git(repo, "commit", "-q", "-a", "-m", "Resolve 02");
  await merge.getByRole("button", { name: "Prune worktree…" }).click();
  await merge.getByRole("button", { name: "Confirm prune" }).click();
  await expect.poll(() => existsSync(worktree)).toBe(false);
  expect(git(repo, "branch", "--list", "shop/02-grill").trim()).toBe("");

  await app.close();
});
