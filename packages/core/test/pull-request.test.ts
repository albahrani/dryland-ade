import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWorktree,
  DrylandError,
  findPullRequest,
  forgeOf,
  nodeProcessRunner,
  openPullRequest,
  type ProcessResult,
  type ProcessRunner,
  requestName,
} from "../src/index.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

function fixture(): string {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-pr-")));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
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

async function withBranch() {
  const repo = fixture();
  const wt = await createWorktree(nodeProcessRunner, repo, { map: "shop", slug: "cart" });
  writeFileSync(join(wt.path, "src/b.ts"), "b1\n");
  git(wt.path, "add", ".");
  git(wt.path, "commit", "-q", "-m", "Add b");
  return { repo, wt };
}

const ok = (stdout = ""): ProcessResult => ({ stdout, stderr: "", exitCode: 0 });
const fail = (stderr = "boom"): ProcessResult => ({ stdout: "", stderr, exitCode: 1 });

/** Real git except `push`; `gh` and `glab` answer from `forge`. Every forge or push call is recorded. */
function fakeRunner(forge: (command: string, args: string[]) => ProcessResult) {
  const calls: string[] = [];
  const runner: ProcessRunner = {
    async run(command, args, options) {
      if (command === "git" && args[0] !== "push") return nodeProcessRunner.run(command, args, options);
      calls.push([command, ...args].join(" "));
      return command === "git" ? ok() : forge(command, args);
    },
  };
  return { runner, calls };
}

describe("forgeOf", () => {
  it("maps a tracker to its forge, and local markdown to none", () => {
    expect(forgeOf("github")).toBe("github");
    expect(forgeOf("gitlab")).toBe("gitlab");
    expect(forgeOf("local-markdown")).toBeNull();
    expect(requestName("github")).toBe("PR");
    expect(requestName("gitlab")).toBe("MR");
  });
});

describe("findPullRequest", () => {
  it("reads a GitHub PR for the branch", async () => {
    const { runner, calls } = fakeRunner(() =>
      ok(JSON.stringify([{ number: 7, state: "MERGED", url: "https://x/pull/7" }])),
    );
    expect(await findPullRequest(runner, "/repo", "github", "b")).toEqual({
      number: 7,
      state: "merged",
      url: "https://x/pull/7",
    });
    expect(calls[0]).toBe("gh pr list --head b --state all --json number,state,url --limit 1");
  });

  it("reads a GitLab MR for the branch", async () => {
    const { runner } = fakeRunner(() => ok(JSON.stringify([{ iid: 3, state: "opened", web_url: "https://x/mr/3" }])));
    expect(await findPullRequest(runner, "/repo", "gitlab", "b")).toEqual({
      number: 3,
      state: "open",
      url: "https://x/mr/3",
    });
  });

  it("is null when the branch has none", async () => {
    const { runner } = fakeRunner(() => ok("[]"));
    expect(await findPullRequest(runner, "/repo", "github", "b")).toBeNull();
  });

  it("says gh is missing, or logged out, with the next action", async () => {
    const missing = fakeRunner(() => fail("not found"));
    await expect(findPullRequest(missing.runner, "/repo", "github", "b")).rejects.toThrow(/not installed/);
    const loggedOut = fakeRunner((_c, args) =>
      args[0] === "auth" ? fail() : args[0] === "--version" ? ok("gh 2") : fail(),
    );
    const error = await findPullRequest(loggedOut.runner, "/repo", "github", "b").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DrylandError);
    expect((error as DrylandError).nextAction).toMatch(/gh auth login/);
  });
});

describe("openPullRequest", () => {
  const answer = (created: string[]) => (_command: string, args: string[]) => {
    if (args[1] === "list" || args[0] === "api") return ok("[]");
    created.push(args.join(" "));
    return ok("https://x/pull/9\n");
  };

  it("pushes the branch, creates the PR through gh and reads it back", async () => {
    const { repo, wt } = await withBranch();
    const created: string[] = [];
    let listed = 0;
    const { runner, calls } = fakeRunner((command, args) => {
      if (args[1] === "list") {
        listed += 1;
        return ok(listed === 1 ? "[]" : JSON.stringify([{ number: 9, state: "OPEN", url: "https://x/pull/9" }]));
      }
      return answer(created)(command, args);
    });
    const pr = await openPullRequest(runner, repo, "github", wt.branch);
    expect(pr).toEqual({ number: 9, state: "open", url: "https://x/pull/9" });
    expect(calls.filter((c) => c.startsWith("git push"))).toEqual([`git push -u origin ${wt.branch}`]);
    expect(created).toEqual([`pr create --head ${wt.branch} --base main --fill`]);
  });

  it("creates an MR through glab", async () => {
    const { repo, wt } = await withBranch();
    const created: string[] = [];
    let listed = 0;
    const { runner } = fakeRunner((command, args) => {
      if (args[0] === "api") {
        listed += 1;
        return ok(listed === 1 ? "[]" : JSON.stringify([{ iid: 2, state: "opened", web_url: "https://x/mr/2" }]));
      }
      return answer(created)(command, args);
    });
    expect((await openPullRequest(runner, repo, "gitlab", wt.branch)).number).toBe(2);
    expect(created).toEqual([`mr create --source-branch ${wt.branch} --target-branch main --fill --yes`]);
  });

  it("returns the existing PR without pushing or creating", async () => {
    const { repo, wt } = await withBranch();
    const { runner, calls } = fakeRunner(() => ok(JSON.stringify([{ number: 4, state: "OPEN", url: "u" }])));
    expect((await openPullRequest(runner, repo, "github", wt.branch)).number).toBe(4);
    expect(calls.some((c) => c.startsWith("git push") || c.includes("pr create"))).toBe(false);
  });

  it("applies the dry-run checks first, and pushes nothing when one blocks", async () => {
    const { repo, wt } = await withBranch();
    writeFileSync(join(wt.path, "src/a.ts"), "dirty\n");
    const { runner, calls } = fakeRunner(() => ok("[]"));
    await expect(openPullRequest(runner, repo, "github", wt.branch)).rejects.toThrow(/uncommitted changes/);
    expect(calls.some((c) => c.startsWith("git push"))).toBe(false);
  });

  it("does not mind a dirty main checkout, which a PR never touches", async () => {
    const { repo, wt } = await withBranch();
    writeFileSync(join(repo, "src/a.ts"), "dirty main\n");
    const { runner } = fakeRunner(() => ok("[]"));
    // Reaches the create call (which this fake answers with a URL, then finds no PR to read back).
    await expect(openPullRequest(runner, repo, "github", wt.branch)).rejects.toThrow(/not found afterwards/);
  });
});
