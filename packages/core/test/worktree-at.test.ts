import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorktree, nodeProcessRunner, worktreeAt } from "../src/index.ts";

function fixture(): string {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-worktree-at-")));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n",
    ".scratch/shop/issues/01-cart.md": "# Cart\n\nType: task\nStatus: ready-for-agent\n\nBuild it.\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  git("add", ".");
  git("commit", "-q", "-m", "Fixture");
  return repo;
}

describe("worktreeAt", () => {
  it("finds the ticket's worktree from its root and from a directory inside it", async () => {
    const repo = fixture();
    const created = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });
    mkdirSync(join(created.path, "src/deep"), { recursive: true });

    for (const cwd of [created.path, join(created.path, "src/deep")]) {
      const found = await worktreeAt(nodeProcessRunner, repo, cwd);
      expect(found).toMatchObject({
        branch: created.branch,
        path: created.path,
        link: { kind: "name", ticket: "shop/01" },
      });
    }
  });

  it("finds a scratch worktree, which links to no ticket", async () => {
    const repo = fixture();
    const created = await createWorktree(nodeProcessRunner, repo, { map: "shop", slug: "poke" });

    const found = await worktreeAt(nodeProcessRunner, repo, created.path);

    expect(found?.link).toEqual({ kind: "scratch", ticket: null });
  });

  it("finds the main checkout as unlinked, and nothing for a directory outside every worktree", async () => {
    const repo = fixture();
    await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });

    expect(await worktreeAt(nodeProcessRunner, repo, repo)).toMatchObject({ main: true, link: { kind: "unlinked" } });
    expect(await worktreeAt(nodeProcessRunner, repo, tmpdir())).toBeNull();
  });
});
