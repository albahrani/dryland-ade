import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nodeProcessRunner, worktreeForTicket } from "@dryland/core";
import { beforeAll, describe, expect, it } from "vitest";
import { createExplorer } from "../src/main/explorer.ts";
import { createSourceControl } from "../src/main/source-control.ts";
import { fixtureRepo } from "./fixture-repo.ts";

const write = (root: string, file: string, content: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

let repo: string;
let worktree: string;
let explorer: ReturnType<typeof createExplorer>;
let sc: ReturnType<typeof createSourceControl>;

beforeAll(async () => {
  repo = realpathSync.native(fixtureRepo());
  write(repo, "src/a.ts", "a1\n");
  write(repo, "src/b.ts", "b1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Add source");
  worktree = (await worktreeForTicket(nodeProcessRunner, repo, "shop/02")).path;
  explorer = createExplorer(nodeProcessRunner, repo);
  sc = createSourceControl(nodeProcessRunner, repo, explorer);
});

describe("status", () => {
  it("keeps staged and changed files apart, against HEAD", async () => {
    write(worktree, "src/a.ts", "a2\n");
    write(worktree, "src/new.ts", "n\n");
    git(worktree, "add", "src/a.ts");
    write(worktree, "src/a.ts", "a3\n"); // staged and edited again: in both lists
    rmSync(join(worktree, "src/b.ts"));

    expect(await sc.status(worktree)).toEqual({
      staged: [{ path: "src/a.ts", status: "modified" }],
      changed: [
        { path: "src/a.ts", status: "modified" },
        { path: "src/b.ts", status: "deleted" },
        { path: "src/new.ts", status: "untracked" },
      ],
    });
  });

  it("refuses a root that is no worktree of the project", async () => {
    await expect(sc.status(join(repo, "src"))).rejects.toThrow(/not a worktree/);
  });
});

describe("staging", () => {
  it("stages and unstages files, deletions and new files included", async () => {
    await sc.stage(worktree, ["src/b.ts", "src/new.ts"]);
    expect((await sc.status(worktree)).staged).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "deleted" },
      { path: "src/new.ts", status: "added" },
    ]);

    await sc.unstage(worktree, ["src/b.ts", "src/new.ts"]);
    expect((await sc.status(worktree)).staged).toEqual([{ path: "src/a.ts", status: "modified" }]);
  });

  it("refuses paths outside the worktree", async () => {
    await expect(sc.stage(worktree, ["../x"])).rejects.toThrow(/outside/);
    await expect(sc.unstage(worktree, ["C:/Windows/x"])).rejects.toThrow(/outside/);
  });
});

describe("committing", () => {
  it("needs a message and something staged", async () => {
    expect(await sc.commit(worktree, "  ")).toMatchObject({ ok: false, message: expect.stringMatching(/message/) });
    await sc.unstage(worktree, ["src/a.ts"]);
    expect(await sc.commit(worktree, "Nothing")).toMatchObject({ ok: false, message: expect.stringMatching(/Stage/) });
  });

  it("commits the staged files in that worktree only", async () => {
    const mainHead = git(repo, "rev-parse", "HEAD");
    await sc.stage(worktree, ["src/a.ts"]);

    const result = await sc.commit(worktree, "Change a");

    expect(result.ok).toBe(true);
    expect(git(worktree, "log", "-1", "--format=%s").trim()).toBe("Change a");
    expect(git(repo, "rev-parse", "HEAD")).toBe(mainHead);
    expect((await sc.status(worktree)).staged).toEqual([]);
  });
});

describe("commit graph", () => {
  it("shows the branch's commits ahead of the default branch, then the base's", async () => {
    const graph = await sc.graph(worktree);

    expect(graph).toMatchObject({ base: "main", ahead: 1, behind: 0 });
    expect(graph.commits.map((c) => `${c.side}:${c.subject}`)).toEqual([
      "branch:Change a",
      "base:Add source",
      "base:Fixture",
    ]);
  });

  it("counts commits the default branch gained since", async () => {
    write(repo, "src/c.ts", "c\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "Main moves on");

    expect(await sc.graph(worktree)).toMatchObject({ ahead: 1, behind: 1 });
  });
});

describe("linking", () => {
  it("lists a worktree Dryland did not create as unlinked, and only that", async () => {
    const other = join(repo, "..", `${repo.split(/[\\/]/).at(-1)}-other`);
    git(repo, "worktree", "add", "-q", "-b", "feature/x", other);

    expect(await sc.unlinked()).toEqual([{ branch: "feature/x", path: realpathSync.native(other) }]);
  });

  it("selects a branch linked only by a commit trailer for its ticket", async () => {
    const trailer = join(repo, "..", `${repo.split(/[\\/]/).at(-1)}-trailer`);
    git(repo, "worktree", "add", "-q", "-b", "side-work", trailer);
    git(trailer, "commit", "-q", "--allow-empty", "-m", "Do it\n\nDryland-Ticket: shop/03");

    const root = await explorer.resolveRoot({ kind: "ticket", ticket: { map: "shop", id: "03" } });

    expect(root).toMatchObject({ path: realpathSync.native(trailer), link: "trailer", ticket: "shop/03" });
    expect((await sc.unlinked()).map((u) => u.branch)).not.toContain("side-work");
  });
});

describe("conflicts", () => {
  it("lists an unmerged file once, as changed, never as staged", async () => {
    const other = join(repo, "..", `${repo.split(/[\\/]/).at(-1)}-conflict`);
    git(repo, "worktree", "add", "-q", "-b", "conflict-side", other);
    write(other, "src/a.ts", "side\n");
    git(other, "commit", "-q", "-a", "-m", "Side");
    write(repo, "src/a.ts", "main\n");
    git(repo, "commit", "-q", "-a", "-m", "Main edit");
    try {
      git(other, "merge", "main");
    } catch {
      // the conflict is the point
    }

    expect(await sc.status(other)).toEqual({ staged: [], changed: [{ path: "src/a.ts", status: "modified" }] });
  });
});
