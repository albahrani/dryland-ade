import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkMerge, createWorktree, mergeWorktree, nodeProcessRunner } from "../src/index.ts";

const runner = nodeProcessRunner;

function fixture(): string {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-merge-")));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n",
    ".scratch/shop/issues/01-cart.md": "# Cart\n\nType: task\nStatus: ready-for-agent\n\nBuild it.\n",
    "src/a.ts": "a1\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Fixture");
  return repo;
}

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

function commitFile(cwd: string, file: string, content: string, message: string): void {
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), content);
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", message);
}

/** A repo with a ticket worktree one commit ahead; the ticket is resolved when `resolved`. */
async function withWork(resolved = true) {
  const repo = fixture();
  if (resolved) {
    const file = join(repo, ".scratch/shop/issues/01-cart.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("Status: ready-for-agent", "Status: resolved"));
    git(repo, "commit", "-qam", "Resolve 01");
  }
  const wt = await createWorktree(runner, repo, { ticket: "shop/01" });
  commitFile(wt.path, "src/b.ts", "b1\n", "Add b");
  return { repo, wt };
}

describe("checkMerge", () => {
  it("finds nothing in the way of a clean, resolved branch", async () => {
    const { repo, wt } = await withWork();
    expect(await checkMerge(runner, repo, wt.branch)).toEqual({
      branch: wt.branch,
      base: "main",
      ahead: 1,
      blockers: [],
      hints: [],
    });
  });

  it("blocks on a dirty worktree and on a dirty main checkout", async () => {
    const { repo, wt } = await withWork();
    writeFileSync(join(wt.path, "src/a.ts"), "edited\n");
    writeFileSync(join(repo, "src/a.ts"), "edited too\n");
    const check = await checkMerge(runner, repo, wt.branch);
    expect(check.blockers.map((b) => b.kind)).toEqual(["dirty-worktree", "dirty-main"]);
  });

  it("blocks on conflicts, naming the files", async () => {
    const { repo, wt } = await withWork();
    commitFile(wt.path, "src/a.ts", "theirs\n", "Edit a on the branch");
    commitFile(repo, "src/a.ts", "ours\n", "Edit a on main");
    const check = await checkMerge(runner, repo, wt.branch);
    expect(check.blockers).toEqual([{ kind: "conflicts", files: ["src/a.ts"] }]);
  });

  it("only hints at an unresolved ticket", async () => {
    const { repo, wt } = await withWork(false);
    const check = await checkMerge(runner, repo, wt.branch);
    expect(check.blockers).toEqual([]);
    expect(check.hints).toEqual([expect.stringMatching(/shop\/01 is not resolved/)]);
  });

  it("blocks when the main checkout is not on the default branch", async () => {
    const { repo, wt } = await withWork();
    git(repo, "checkout", "-q", "-b", "elsewhere");
    expect((await checkMerge(runner, repo, wt.branch)).blockers.map((b) => b.kind)).toEqual(["main-off-default"]);
  });
});

describe("mergeWorktree", () => {
  it("merges with a merge commit and cleans up when every prune condition holds", async () => {
    const { repo, wt } = await withWork();
    const result = await mergeWorktree(runner, repo, wt.branch, {
      strategy: "merge",
      cleanup: true,
      sessionAttached: false,
    });
    expect(result.cleanup).toEqual({ removed: true });
    expect(git(repo, "log", "-1", "--format=%P", "main").trim().split(" ")).toHaveLength(2);
    expect(existsSync(join(repo, "src/b.ts"))).toBe(true);
    expect(existsSync(wt.path)).toBe(false);
    expect(git(repo, "branch", "--list", wt.branch).trim()).toBe("");
  });

  it("fast-forwards, and squashes into one commit", async () => {
    const ff = await withWork();
    await mergeWorktree(runner, ff.repo, ff.wt.branch, {
      strategy: "fast-forward",
      cleanup: false,
      sessionAttached: false,
    });
    expect(git(ff.repo, "log", "-1", "--format=%s", "main").trim()).toBe("Add b");

    const sq = await withWork();
    commitFile(sq.wt.path, "src/c.ts", "c1\n", "Add c");
    await mergeWorktree(runner, sq.repo, sq.wt.branch, { strategy: "squash", cleanup: false, sessionAttached: false });
    expect(git(sq.repo, "log", "-1", "--format=%s", "main").trim()).toBe(`Merge ${sq.wt.branch} (squashed)`);
    expect(existsSync(join(sq.repo, "src/c.ts"))).toBe(true);
  });

  it("keeps the worktree and says why when a prune condition fails after the merge", async () => {
    const { repo, wt } = await withWork();
    const result = await mergeWorktree(runner, repo, wt.branch, {
      strategy: "merge",
      cleanup: true,
      sessionAttached: true,
    });
    expect(result.cleanup).toEqual({ removed: false, refused: expect.stringMatching(/session is attached/) });
    expect(existsSync(wt.path)).toBe(true);
  });

  it("refuses to merge while a blocker stands, and changes nothing", async () => {
    const { repo, wt } = await withWork();
    writeFileSync(join(wt.path, "src/a.ts"), "edited\n");
    const before = git(repo, "rev-parse", "main");
    await expect(
      mergeWorktree(runner, repo, wt.branch, { strategy: "merge", cleanup: false, sessionAttached: false }),
    ).rejects.toThrow(/uncommitted changes/);
    expect(git(repo, "rev-parse", "main")).toBe(before);
  });
});
