import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nodeProcessRunner, worktreeForTicket } from "@dryland/core";
import { beforeAll, describe, expect, it } from "vitest";
import { createExplorer } from "../src/main/explorer.ts";
import { fixtureRepo } from "./fixture-repo.ts";

const write = (root: string, file: string, content: string | Buffer) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });

const canonical = (path: string | null) => realpathSync.native(path ?? "");

let repo: string;
let worktree: string;
let explorer: ReturnType<typeof createExplorer>;

beforeAll(async () => {
  // As git names it: Windows temp directories come with 8.3 short names.
  repo = realpathSync.native(fixtureRepo());
  write(repo, ".gitignore", "node_modules/\n*.log\n");
  write(repo, "src/a.ts", "export const a = 1;\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Add source");
  worktree = (await worktreeForTicket(nodeProcessRunner, repo, "shop/02")).path;
  explorer = createExplorer(nodeProcessRunner, repo);
});

describe("root", () => {
  it("is the main checkout with nothing selected", async () => {
    const root = await explorer.resolveRoot(null);

    expect(root).toMatchObject({ path: repo, main: true, branch: "main", ticket: null });
  });

  it("is the ticket's worktree when it has one", async () => {
    const root = await explorer.resolveRoot({ kind: "ticket", ticket: { map: "shop", id: "02" } });

    expect(root).toMatchObject({ path: worktree, main: false, ticket: "shop/02" });
    expect(root.branch).toMatch(/^shop\/02-/);
  });

  it("is the main checkout for a ticket without a worktree", async () => {
    const root = await explorer.resolveRoot({ kind: "ticket", ticket: { map: "shop", id: "03" } });

    expect(root).toMatchObject({ path: repo, main: true });
  });

  it("is a worktree named by path, and falls back to main for a path git does not list", async () => {
    expect((await explorer.resolveRoot({ kind: "worktree", path: worktree })).path).toBe(worktree);
    expect((await explorer.resolveRoot({ kind: "worktree", path: join(repo, "src") })).path).toBe(repo);
  });
});

describe("watching", () => {
  it("names the worktree's own git directory, so its commits can be watched", async () => {
    expect(canonical(await explorer.watchTarget(repo, [""]))).toBe(canonical(join(repo, ".git")));
    expect(canonical(await explorer.watchTarget(worktree, ["src"]))).toMatch(/\.git[\\/]worktrees[\\/]/);
  });

  it("refuses directories outside the worktree, and a root that is not one", async () => {
    await expect(explorer.watchTarget(repo, ["src", ".."])).rejects.toThrow(/outside/);
    await expect(explorer.watchTarget(repo, ["C:/Windows"])).rejects.toThrow(/outside/);
    await expect(explorer.watchTarget(join(repo, "src"), [""])).rejects.toThrow(/not a worktree/);
  });
});

describe("listing a directory", () => {
  it("lists directories before files, hides .git, and marks ignored entries", async () => {
    write(repo, "node_modules/pkg/index.js", "x");
    write(repo, "debug.log", "x");

    const { entries } = await explorer.listDirectory(repo, "");
    const summary = entries.map((e) => `${e.kind}:${e.name}${e.ignored ? " (ignored)" : ""}`);

    expect(summary).toEqual([
      "dir:.scratch",
      "dir:docs",
      "dir:node_modules (ignored)",
      "dir:src",
      "file:.gitignore",
      "file:debug.log (ignored)",
    ]);
  });

  it("lists a subdirectory", async () => {
    expect((await explorer.listDirectory(repo, "src")).entries).toEqual([
      { name: "a.ts", path: "src/a.ts", kind: "file", ignored: false },
    ]);
  });

  it("caps a huge directory instead of listing it all", async () => {
    for (let i = 0; i < 30; i++) write(repo, `many/f${String(i).padStart(2, "0")}.txt`, "");
    const small = createExplorer(nodeProcessRunner, repo, { maxEntries: 10 });

    const { entries, truncated } = await small.listDirectory(repo, "many");

    expect(entries).toHaveLength(10);
    expect(truncated).toBe(true);
    rmSync(join(repo, "many"), { recursive: true });
  });

  it("refuses to leave the worktree", async () => {
    await expect(explorer.listDirectory(repo, "..")).rejects.toThrow(/outside/);
  });
});

describe("reading a file", () => {
  it("returns text", async () => {
    expect(await explorer.readFile(repo, "src/a.ts")).toEqual({
      kind: "text",
      text: "export const a = 1;\n",
      truncated: false,
    });
  });

  it("cuts a very large file and says so", async () => {
    write(repo, "big.txt", "x".repeat(100));
    const small = createExplorer(nodeProcessRunner, repo, { maxFileBytes: 10 });

    expect(await small.readFile(repo, "big.txt")).toEqual({ kind: "text", text: "x".repeat(10), truncated: true });
  });

  it("cuts a large file between characters, never inside one", async () => {
    write(repo, "accents.txt", "ééé");
    const small = createExplorer(nodeProcessRunner, repo, { maxFileBytes: 3 });

    expect(await small.readFile(repo, "accents.txt")).toEqual({ kind: "text", text: "é", truncated: true });
  });

  it("does not show a binary file as text", async () => {
    write(repo, "logo.bin", Buffer.from([0x89, 0x50, 0x00, 0x01]));

    expect(await explorer.readFile(repo, "logo.bin")).toEqual({ kind: "binary" });
  });

  it("reports a file that is gone", async () => {
    expect(await explorer.readFile(repo, "nope.ts")).toEqual({ kind: "missing" });
  });

  it("refuses a path outside the worktree", async () => {
    await expect(explorer.readFile(repo, "../outside.txt")).rejects.toThrow(/outside/);
    await expect(explorer.readFile(repo, join(repo, "src/a.ts"))).rejects.toThrow(/outside/);
  });

  it("refuses a root that is not a worktree of the project", async () => {
    await expect(explorer.readFile(join(repo, "src"), "a.ts")).rejects.toThrow(/not a worktree/);
  });
});

describe("changes and diffs", () => {
  it("lists what changed in a worktree since its base, committed or not, and untracked files", async () => {
    write(worktree, "src/b.ts", "export const b = 1;\n");
    git(worktree, "add", ".");
    git(worktree, "commit", "-q", "-m", "Add b");
    write(worktree, "src/a.ts", "export const a = 2;\n");
    write(worktree, "notes.txt", "hello\n");

    const changes = await explorer.changes(worktree);

    expect(changes).toEqual([
      { path: "notes.txt", status: "untracked" },
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "added" },
    ]);
  });

  it("diffs a modified file against the base", async () => {
    const diff = await explorer.diff(worktree, "src/a.ts");

    expect(diff).toMatchObject({ kind: "text", truncated: false });
    const text = diff.kind === "text" ? diff.text : "";
    expect(text).toContain("-export const a = 1;");
    expect(text).toContain("+export const a = 2;");
  });

  it("diffs an untracked file as all added", async () => {
    expect(await explorer.diff(worktree, "notes.txt")).toEqual({
      kind: "text",
      text: "@@ -0,0 +1,1 @@\n+hello",
      truncated: false,
    });
  });

  it("notes an untracked file's missing final newline, as git does", async () => {
    write(worktree, "no-newline.txt", "hello");

    expect(await explorer.diff(worktree, "no-newline.txt")).toEqual({
      kind: "text",
      text: "@@ -0,0 +1,1 @@\n+hello\n\\ No newline at end of file",
      truncated: false,
    });
  });

  it("says when an untracked file is only partly shown", async () => {
    write(worktree, "long.txt", "abcdefghij\n");
    const small = createExplorer(nodeProcessRunner, repo, { maxFileBytes: 4 });

    expect(await small.diff(worktree, "long.txt")).toEqual({
      kind: "text",
      text: "@@ -0,0 +1,1 @@\n+abcd",
      truncated: true,
    });
  });

  it("does not call a changed binary file unchanged, tracked or not", async () => {
    write(repo, "logo.bin", Buffer.from([0x89, 0x50, 0x00, 0x02]));
    write(repo, "new.bin", Buffer.from([0x00, 0x01]));

    expect(await explorer.diff(repo, "logo.bin")).toEqual({ kind: "binary" });
    expect(await explorer.diff(repo, "new.bin")).toEqual({ kind: "binary" });
  });

  it("shows only uncommitted changes in the main checkout", async () => {
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "Add noise");
    write(repo, "src/a.ts", "export const a = 3;\n");

    expect((await explorer.changes(repo)).map((c) => `${c.status}:${c.path}`)).toEqual(["modified:src/a.ts"]);
  });

  it("lists a deleted file", async () => {
    rmSync(join(repo, "big.txt"));

    expect(await explorer.changes(repo)).toContainEqual({ path: "big.txt", status: "deleted" });
  });
});
