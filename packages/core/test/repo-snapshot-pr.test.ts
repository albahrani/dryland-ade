import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWorktree,
  nextSteps,
  nodeProcessRunner,
  type ProcessResult,
  type ProcessRunner,
  readRepoSnapshot,
  readTickets,
} from "../src/index.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

/** A GitHub-tracked repo whose resolved ticket shop/01 has a worktree one commit ahead. */
async function fixture() {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), "dryland-snap-pr-")));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n",
    ".scratch/shop/issues/01-cart.md": "# Cart\n\nType: task\nStatus: resolved\n\nBuild it.\n",
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
  const wt = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });
  writeFileSync(join(wt.path, "b.txt"), "b\n");
  git(wt.path, "add", ".");
  git(wt.path, "commit", "-q", "-m", "Add b");
  const tickets = await readTickets(repo);
  // The tracker doc is read for the forge; switch it once the tickets are read from disk.
  writeFileSync(join(repo, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
  return { repo, tickets };
}

const ok = (stdout: string): ProcessResult => ({ stdout, stderr: "", exitCode: 0 });

const forgeAnswering = (answer: () => ProcessResult): ProcessRunner => ({
  run: (command, args, options) =>
    command === "gh" ? Promise.resolve(answer()) : nodeProcessRunner.run(command, args, options),
});

const commands = async (runner: ProcessRunner) => {
  const { repo, tickets } = await fixture();
  const snapshot = await readRepoSnapshot(runner, repo, tickets);
  return { snapshot, commands: nextSteps(snapshot).map((s) => s.command) };
};

describe("readRepoSnapshot on a forge", () => {
  it("stops recommending /pr once a PR exists", async () => {
    const open = forgeAnswering(() => ok(JSON.stringify([{ number: 1, state: "OPEN", url: "u" }])));
    const { snapshot, commands: steps } = await commands(open);
    expect(snapshot.git?.worktrees[0]?.prExists).toBe(true);
    expect(steps).not.toContain("/pr");
  });

  it("recommends /retro once the PR is merged", async () => {
    const merged = forgeAnswering(() => ok(JSON.stringify([{ number: 1, state: "MERGED", url: "u" }])));
    const { steps } = await commands(merged).then((r) => ({ steps: r.commands }));
    expect(steps).toContain("/retro");
    expect(steps).not.toContain("/pr");
  });

  it("recommends /pr when the branch has no PR", async () => {
    const none = forgeAnswering(() => ok("[]"));
    const { snapshot, commands: steps } = await commands(none);
    expect(snapshot.git?.worktrees[0]?.prExists).toBe(false);
    expect(steps).toContain("/pr");
  });

  it("leaves it unknown when gh cannot answer", async () => {
    const broken = forgeAnswering(() => ({ stdout: "", stderr: "no", exitCode: 1 }));
    const { snapshot } = await commands(broken);
    expect(snapshot.git?.worktrees[0]?.prExists).toBeNull();
  });
});
