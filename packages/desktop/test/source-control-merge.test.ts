import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nodeProcessRunner, worktreeForTicket } from "@dryland/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createExplorer } from "../src/main/explorer.ts";
import { createSourceControl } from "../src/main/source-control.ts";
import { fixtureRepo } from "./fixture-repo.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
const commitFile = (cwd: string, file: string, content: string, message: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), content);
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", message);
};

let repo: string;
let worktree: string;
let branch: string;
let attached: boolean;
let typed: { path: string; text: string }[];
let pruned: string[];
let sc: ReturnType<typeof createSourceControl>;

beforeEach(async () => {
  repo = fixtureRepo();
  commitFile(repo, "src/a.ts", "a1\n", "Add a");
  const made = await worktreeForTicket(nodeProcessRunner, repo, "shop/02");
  worktree = made.path;
  branch = made.branch;
  commitFile(worktree, "src/b.ts", "b1\n", "Add b");
  attached = false;
  typed = [];
  pruned = [];
  sc = createSourceControl(nodeProcessRunner, repo, createExplorer(nodeProcessRunner, repo), {
    attached: () => attached,
    handToAgent: (path, text) => {
      typed.push({ path, text });
      return true;
    },
    onPruned: (path) => void pruned.push(path),
  });
});

const resolveTicket = () => {
  const file = join(repo, ".scratch/shop/issues/02-grill.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("Status: ready-for-agent", "Status: resolved"));
  git(repo, "commit", "-qam", "Resolve 02");
};

describe("mergeCheck", () => {
  it("shows an unresolved ticket as a hint and nothing as a blocker", async () => {
    const check = await sc.mergeCheck(worktree);
    expect(check.blockers).toEqual([]);
    expect(check.hints).toEqual([expect.stringMatching(/shop\/02 is not resolved/)]);
  });

  it("words each blocker so the merge action can say why it is disabled", async () => {
    writeFileSync(join(worktree, "src/a.ts"), "dirty\n");
    expect((await sc.mergeCheck(worktree)).blockerMessages).toEqual([
      expect.stringMatching(/worktree has uncommitted changes/),
    ]);
  });
});

describe("merge", () => {
  it("merges with the chosen strategy and the commit shows in the graph", async () => {
    const result = await sc.merge(worktree, "merge", false);
    expect(result).toMatchObject({ ok: true });
    const graph = await sc.graph(worktree);
    expect(graph).toMatchObject({ ahead: 0, behind: 1 });
    expect(git(repo, "log", "-1", "--format=%P", "main").trim().split(" ")).toHaveLength(2);
  });

  it("is refused with the reason while a blocker stands", async () => {
    writeFileSync(join(worktree, "src/a.ts"), "dirty\n");
    expect(await sc.merge(worktree, "merge", false)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/uncommitted/),
    });
  });

  it("with cleanup removes the worktree and branch when the ticket is resolved, and reports the prune", async () => {
    resolveTicket();
    const result = await sc.merge(worktree, "merge", true);
    expect(result).toMatchObject({ ok: true, result: { cleanup: { removed: true } } });
    expect(existsSync(worktree)).toBe(false);
    expect(pruned).toEqual([worktree]);
  });

  it("with cleanup keeps the worktree, naming the unresolved ticket, and prunes nothing", async () => {
    const result = await sc.merge(worktree, "merge", true);
    expect(result).toMatchObject({
      ok: true,
      result: { cleanup: { removed: false, refused: expect.stringMatching(/not resolved/) } },
    });
    expect(existsSync(worktree)).toBe(true);
  });
});

describe("hand to agent", () => {
  const conflict = () => {
    commitFile(worktree, "src/a.ts", "theirs\n", "Edit a on the branch");
    commitFile(repo, "src/a.ts", "ours\n", "Edit a on main");
  };

  it("pre-types a prompt describing the conflict into the worktree's session and changes no file", async () => {
    conflict();
    const before = [
      git(repo, "status", "--porcelain"),
      git(worktree, "status", "--porcelain"),
      git(repo, "rev-parse", "HEAD"),
    ];

    const result = await sc.handConflictsToAgent(worktree);

    expect(result).toEqual({ ok: true });
    expect(typed).toEqual([{ path: worktree, text: expect.stringMatching(/main.*conflict.*src\/a\.ts/) }]);
    expect(typed[0]!.text).not.toMatch(/[\r\n]/);
    expect([
      git(repo, "status", "--porcelain"),
      git(worktree, "status", "--porcelain"),
      git(repo, "rev-parse", "HEAD"),
    ]).toEqual(before);
  });

  it("says so when the branch does not conflict, or no session runs in the worktree", async () => {
    expect(await sc.handConflictsToAgent(worktree)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/no conflicts/),
    });
    conflict();
    const bare = createSourceControl(nodeProcessRunner, repo, createExplorer(nodeProcessRunner, repo));
    expect(await bare.handConflictsToAgent(worktree)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/session/),
    });
  });
});

describe("prune", () => {
  it("removes worktree and branch once every condition holds", async () => {
    await sc.merge(worktree, "merge", false);
    resolveTicket();
    expect(await sc.prune(worktree)).toEqual({ ok: true });
    expect(existsSync(worktree)).toBe(false);
    expect(git(repo, "branch", "--list", branch).trim()).toBe("");
    expect(pruned).toEqual([worktree]);
  });

  it.each([
    ["ticket is unresolved", false, () => undefined, /not resolved/],
    [
      "branch has unmerged commits",
      true,
      () => commitFile(worktree, "src/z.ts", "z\n", "More work"),
      /unmerged commits/,
    ],
    ["tree is dirty", true, () => writeFileSync(join(worktree, "d.txt"), "x"), /uncommitted changes/],
    ["a session is attached", true, () => void (attached = true), /session is attached/],
  ])("is refused, naming the failed condition, when the %s", async (_name, resolved, setup, message) => {
    await sc.merge(worktree, "merge", false);
    if (resolved) resolveTicket();
    setup();
    const result = await sc.prune(worktree);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(message) });
    expect(existsSync(worktree)).toBe(true);
  });
});
