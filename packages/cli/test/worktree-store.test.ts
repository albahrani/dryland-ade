import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TempRepo, tempDir } from "./harness.ts";

// The store twin of worktree.test.ts: the same worktree commands on a repo whose tickets live in the state store.

const shopRepo = () => TempRepo.createStore([{ effort: "shop", tickets: [{ title: "Cart" }, { title: "Checkout" }] }]);

interface Created {
  branch: string;
  path: string;
  ticket: string | null;
}

async function create(repo: TempRepo, ...args: string[]): Promise<Created> {
  const result = await repo.run(["worktree", "create", ...args, "--json"]);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as Created;
}

function commitIn(path: string, file: string, message: string): void {
  writeFileSync(join(path, file), "work\n");
  execFileSync("git", ["add", "-A"], { cwd: path });
  execFileSync("git", ["commit", "--quiet", "-m", message], { cwd: path });
}

describe("dryland worktree create on the store", () => {
  it("makes one worktree and branch per ticket, named <effort>/<NN>-<slug>", async () => {
    const repo = await shopRepo();

    const created = await create(repo, "shop/01");

    expect(created).toMatchObject({ branch: "shop/01-cart", ticket: "shop/01" });
    expect(existsSync(created.path)).toBe(true);
    expect(execFileSync("git", ["branch", "--show-current"], { cwd: created.path, encoding: "utf8" }).trim()).toBe(
      "shop/01-cart",
    );
    expect(repo.git("worktree", "list")).toContain("shop/01-cart");
  });

  it("starts the branch from the default branch even when the main checkout is on another one", async () => {
    const repo = await shopRepo();
    repo.git("checkout", "--quiet", "-b", "feature/wip");
    repo.write("wip.txt", "wip\n");
    repo.commitAll("Work in progress");

    const created = await create(repo, "shop/01");

    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: created.path, encoding: "utf8" }).trim()).toBe(
      repo.git("rev-parse", "main"),
    );
  });

  it("suffixes the name when a worktree for the ticket already exists", async () => {
    const repo = await shopRepo();
    const first = await create(repo, "shop/01");

    const second = await create(repo, "shop/01");

    expect(first.branch).toBe("shop/01-cart");
    expect(second.branch).toBe("shop/01-cart-2");
    expect(second.path).not.toBe(first.path);
  });

  it("makes a scratch worktree without a ticket, refuses --slug with one, and fails for an unknown ticket", async () => {
    const repo = await shopRepo();

    const scratch = await create(repo, "--map", "shop", "--slug", "Try Stripe!");
    const both = await repo.run(["worktree", "create", "shop/01", "--slug", "spike"]);
    const unknown = await repo.run(["worktree", "create", "shop/09"]);
    const neither = await repo.run(["worktree", "create"]);

    expect(scratch).toMatchObject({ branch: "shop/scratch-try-stripe", ticket: null });
    expect(both.exitCode).not.toBe(0);
    expect(both.stderr).toContain("--slug");
    expect(unknown.exitCode).not.toBe(0);
    expect(unknown.stderr).toContain("shop/09");
    expect(unknown.stderr).toContain("Next:");
    expect(neither.exitCode).not.toBe(0);
    expect(neither.stderr).toContain("--map");
  });

  it("is claimed for by the branch of the worktree it made, from inside that worktree", async () => {
    const repo = await shopRepo();
    const created = await create(repo, "shop/01");

    const claim = await repo.run(["ticket", "claim", "shop/01"], created.path);

    expect(claim.stdout).toBe("Claimed shop/01 for shop/01-cart.\n");
  });
});

describe("dryland worktree list on the store", () => {
  it("links by name, falls back to the commit trailer, and marks the rest unlinked", async () => {
    const repo = await shopRepo();
    await create(repo, "shop/01");
    await create(repo, "--map", "shop", "--slug", "spike");
    const byTrailer = repo.addWorktree("hotfix/cart");
    commitIn(byTrailer, "fix.txt", "Fix the cart\n\nDryland-Ticket: shop/02");
    repo.addWorktree("feature/other");

    const result = await repo.run(["worktree", "list", "--json"]);

    expect(result.exitCode).toBe(0);
    const entries = JSON.parse(result.stdout) as { branch: string; link: { kind: string; ticket: string | null } }[];
    const byBranch = Object.fromEntries(entries.map((e) => [e.branch, e.link]));
    expect(byBranch["shop/01-cart"]).toEqual({ kind: "name", ticket: "shop/01" });
    expect(byBranch["shop/scratch-spike"]).toEqual({ kind: "scratch", ticket: null });
    expect(byBranch["hotfix/cart"]).toEqual({ kind: "trailer", ticket: "shop/02" });
    expect(byBranch["feature/other"]).toEqual({ kind: "unlinked", ticket: null });
    expect(byBranch["main"]).toEqual({ kind: "unlinked", ticket: null });
    expect((await repo.run(["worktree", "list"])).stdout).toMatch(/shop\/01-cart\s+shop\/01/);
  });
});

describe("dryland worktree prune on the store", () => {
  async function resolved(repo: TempRepo, ticket = "shop/01"): Promise<void> {
    expect((await repo.run(["ticket", "resolve", ticket, "--answer", "Done."])).exitCode).toBe(0);
  }

  it("removes the worktree and its branch when every condition holds and --yes is given", async () => {
    const repo = await shopRepo();
    const { path } = await create(repo, "shop/01");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(path)).toBe(false);
    expect(repo.git("branch", "--list", "shop/01-cart")).toBe("");
  });

  it("also removes a branch whose commits are all merged", async () => {
    const repo = await shopRepo();
    const { path } = await create(repo, "shop/01");
    commitIn(path, "cart.txt", "Add cart");
    repo.git("merge", "--quiet", "--no-ff", "-m", "Merge cart", "shop/01-cart");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.exitCode).toBe(0);
    expect(repo.git("branch", "--list", "shop/01-cart")).toBe("");
  });

  it("does nothing without --yes and says so", async () => {
    const repo = await shopRepo();
    const { path } = await create(repo, "shop/01");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Nothing was removed");
    expect(existsSync(path)).toBe(true);
  });

  it("refuses while the ticket is unresolved, the branch has unmerged commits, the worktree is dirty or a session is attached", async () => {
    const repo = await shopRepo();
    const { path } = await create(repo, "shop/01");

    const unresolved = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);
    commitIn(path, "cart.txt", "Add cart");
    writeFileSync(join(path, "notes.txt"), "wip\n");
    const all = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);
    await resolved(repo);
    const attached = await repo.run(["worktree", "prune", "shop/01-cart", "--yes", "--session-attached"]);

    expect(unresolved.exitCode).not.toBe(0);
    expect(unresolved.stderr).toContain("shop/01 is not resolved");
    expect(all.stderr).toContain("not resolved");
    expect(all.stderr).toContain("unmerged commits");
    expect(all.stderr).toContain("uncommitted changes");
    expect(attached.exitCode).not.toBe(0);
    expect(attached.stderr).toContain("session is attached");
    expect(existsSync(path)).toBe(true);
  });

  it("prunes a scratch worktree, and refuses a branch dryland cannot tie to a ticket", async () => {
    const repo = await shopRepo();
    const { path } = await create(repo, "--map", "shop", "--slug", "spike");
    const other = repo.addWorktree("feature/other");

    const scratch = await repo.run(["worktree", "prune", "shop/scratch-spike", "--yes"]);
    const unlinked = await repo.run(["worktree", "prune", "feature/other", "--yes"]);

    expect(scratch.exitCode).toBe(0);
    expect(existsSync(path)).toBe(false);
    expect(unlinked.exitCode).not.toBe(0);
    expect(unlinked.stderr).toContain("not linked");
    expect(existsSync(other)).toBe(true);
  });

  it("takes the pruned worktree off Copilot's trustedFolders and touches nothing else in the config", async () => {
    const repo = await shopRepo();
    const { path } = await create(repo, "shop/01");
    await resolved(repo);
    const home = tempDir("dryland-copilot-home-");
    const config = `{\n  "theme": "dark",\n  "trustedFolders": [\n    "/other",\n    ${JSON.stringify(path)}\n  ]\n}\n`;
    writeFileSync(join(home, "config.json"), config);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"], repo.path, { COPILOT_HOME: home });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(home, "config.json"), "utf8")).toBe(config.replace(`,\n    ${JSON.stringify(path)}`, ""));
  });
});
