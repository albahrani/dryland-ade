import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeProcessRunner, type ProcessResult, type ProcessRunner } from "@dryland/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createExplorer } from "../src/main/explorer.ts";
import { createSourceControl } from "../src/main/source-control.ts";
import { fixtureRepo } from "./fixture-repo.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
const ok = (stdout = ""): ProcessResult => ({ stdout, stderr: "", exitCode: 0 });

let repo: string;
let worktree: string;
let forgeCalls: string[];
let existing: unknown[];

/** Real git except `push`; `gh` and `glab` are answered here, so no network is touched. */
const runner: ProcessRunner = {
  async run(command, args, options) {
    if (command === "git" && args[0] !== "push") return nodeProcessRunner.run(command, args, options);
    // Listing the worktrees reads the tracker's issues; this project has none.
    if (args[0] === "issue" || (args[0] === "api" && !args.some((a) => a.includes("merge_requests")))) return ok("[]");
    forgeCalls.push([command, ...args].join(" "));
    if (command === "git") return ok();
    return ok(args.includes("create") ? "https://x/pull/5\n" : JSON.stringify(existing));
  },
};

const setTracker = (title: string) => {
  writeFileSync(join(repo, "docs/agents/issue-tracker.md"), `# Issue tracker: ${title}\n`);
  git(repo, "commit", "-qam", "Tracker");
};

beforeEach(() => {
  repo = fixtureRepo();
  forgeCalls = [];
  existing = [];
  // A branch no ticket is named for, so the dry run does not read the forge's issues.
  worktree = `${repo}-feature`;
  git(repo, "worktree", "add", "-q", "-b", "feature", worktree);
  writeFileSync(join(worktree, "b.txt"), "b\n");
  git(worktree, "add", ".");
  git(worktree, "commit", "-q", "-m", "Add b");
});

const sc = () => createSourceControl(runner, repo, createExplorer(runner, repo));

describe("pullRequest", () => {
  it("is null on a local-markdown project", async () => {
    expect(await sc().pullRequest(worktree)).toBeNull();
  });

  it("offers Open PR on GitHub and Open MR on GitLab", async () => {
    setTracker("GitHub");
    expect(await sc().pullRequest(worktree)).toMatchObject({ forge: "github", name: "PR", request: null });
    setTracker("GitLab");
    expect(await sc().pullRequest(worktree)).toMatchObject({ forge: "gitlab", name: "MR", request: null });
  });

  it("shows an existing request with its state and link", async () => {
    setTracker("GitHub");
    existing = [{ number: 8, state: "OPEN", url: "https://x/pull/8" }];
    expect((await sc().pullRequest(worktree))?.request).toEqual({ number: 8, state: "open", url: "https://x/pull/8" });
  });

  it("lists what blocks opening it", async () => {
    setTracker("GitHub");
    writeFileSync(join(worktree, "b.txt"), "dirty\n");
    expect((await sc().pullRequest(worktree))?.blockerMessages).toEqual([expect.stringMatching(/uncommitted changes/)]);
  });
});

describe("openRequest", () => {
  it("pushes and creates the PR", async () => {
    setTracker("GitHub");
    const calls = forgeCalls;
    let listed = 0;
    const ask = runner.run;
    const spy: ProcessRunner = {
      run: async (command, args, options) => {
        if (command === "gh" && args[0] === "pr" && args[1] === "list")
          existing = ++listed === 1 ? [] : [{ number: 5, state: "OPEN", url: "https://x/pull/5" }];
        return ask(command, args, options);
      },
    };
    const result = await createSourceControl(spy, repo, createExplorer(spy, repo)).openRequest(worktree);
    expect(result).toEqual({ ok: true, request: { number: 5, state: "open", url: "https://x/pull/5" } });
    expect(calls).toContain("git push -u origin feature");
  });

  it("refuses, with the reason, while a check blocks", async () => {
    setTracker("GitHub");
    writeFileSync(join(worktree, "b.txt"), "dirty\n");
    expect(await sc().openRequest(worktree)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/uncommitted/),
    });
    expect(forgeCalls.some((c) => c.startsWith("git push"))).toBe(false);
  });

  it("refuses on a project without a forge", async () => {
    expect(await sc().openRequest(worktree)).toMatchObject({ ok: false });
  });
});
