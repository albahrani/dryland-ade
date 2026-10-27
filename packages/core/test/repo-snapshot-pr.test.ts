import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWorktree,
  nextSteps,
  nodeProcessRunner,
  type ProcessResult,
  type ProcessRunner,
  readRepoSnapshot,
  readTickets,
  resolveStoreTicket,
} from "../src/index.ts";
import { SHOP_CART, storeRepo } from "./store-repo.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

/** A repo with a GitHub origin whose resolved ticket shop/01 has a worktree one commit ahead. */
async function fixture() {
  const repo = await storeRepo(SHOP_CART);
  git(repo, "remote", "add", "origin", "https://github.com/acme/shop.git");
  await resolveStoreTicket(repo, "shop/01", "Done.", { author: "engine" });
  const wt = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });
  writeFileSync(join(wt.path, "b.txt"), "b\n");
  git(wt.path, "add", ".");
  git(wt.path, "commit", "-q", "-m", "Add b");
  return { repo, tickets: await readTickets(repo) };
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

  it("asks no forge when the origin is on another host or there is none", async () => {
    const { repo, tickets } = await fixture();
    git(repo, "remote", "set-url", "origin", "https://git.example.com/acme/shop.git");
    const asked: string[] = [];
    const spy: ProcessRunner = {
      run: (command, args, options) => {
        if (command === "gh" || command === "glab") asked.push(command);
        return nodeProcessRunner.run(command, args, options);
      },
    };

    const snapshot = await readRepoSnapshot(spy, repo, tickets);

    expect(asked).toEqual([]);
    expect(snapshot.git?.worktrees[0]?.prExists).toBeNull();
  });
});
