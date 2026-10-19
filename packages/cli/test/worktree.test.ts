import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TempRepo, tempDir } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";
const TICKET = "# Build the cart\n\nType: task\nStatus: ready-for-agent\n\nCarts live on the server.\n";

function shopRepo(): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
    ".scratch/shop/issues/01-cart.md": TICKET,
    ".scratch/shop/issues/02-checkout.md": TICKET.replace("cart", "checkout"),
  });
}

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

describe("dryland worktree create", () => {
  it("makes one worktree and branch per ticket, named <map>/<NN>-<slug>", async () => {
    const repo = shopRepo();

    const created = await create(repo, "shop/01");

    expect(created).toMatchObject({ branch: "shop/01-cart", ticket: "shop/01" });
    expect(existsSync(created.path)).toBe(true);
    expect(execFileSync("git", ["branch", "--show-current"], { cwd: created.path, encoding: "utf8" }).trim()).toBe(
      "shop/01-cart",
    );
    expect(repo.git("worktree", "list")).toContain("shop/01-cart");
  });

  it("starts the branch from the default branch even when the main checkout is on another one", async () => {
    const repo = shopRepo();
    repo.git("checkout", "--quiet", "-b", "feature/wip");
    repo.write("wip.txt", "wip\n");
    repo.commitAll("Work in progress");
    repo.git("checkout", "--quiet", "main");
    repo.git("checkout", "--quiet", "feature/wip");

    const created = await create(repo, "shop/01");

    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: created.path, encoding: "utf8" }).trim()).toBe(
      repo.git("rev-parse", "main"),
    );
  });

  it("suffixes the name when a worktree for the ticket already exists", async () => {
    const repo = shopRepo();
    const first = await create(repo, "shop/01");

    const second = await create(repo, "shop/01");

    expect(first.branch).toBe("shop/01-cart");
    expect(second.branch).toBe("shop/01-cart-2");
    expect(second.path).not.toBe(first.path);
    expect(existsSync(second.path)).toBe(true);
  });

  it("makes a scratch worktree named <map>/scratch-<slug> without a ticket", async () => {
    const repo = shopRepo();

    const created = await create(repo, "--map", "shop", "--slug", "Try Stripe!");

    expect(created).toMatchObject({ branch: "shop/scratch-try-stripe", ticket: null });
    expect(existsSync(created.path)).toBe(true);
  });

  it("refuses --slug together with a ticket instead of ignoring it", async () => {
    const repo = shopRepo();

    const result = await repo.run(["worktree", "create", "shop/01", "--slug", "spike"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--slug");
    expect(repo.git("worktree", "list")).not.toContain("shop/01-cart");
  });

  it("fails clearly for a ticket that does not exist", async () => {
    const repo = shopRepo();

    const result = await repo.run(["worktree", "create", "shop/09"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("shop/09");
    expect(result.stderr).toContain("Next:");
  });

  it("asks for a map when neither a ticket nor --map is given", async () => {
    const repo = shopRepo();

    const result = await repo.run(["worktree", "create"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--map");
  });
});

describe("dryland worktree list", () => {
  it("links by name, falls back to the commit trailer, and marks the rest unlinked", async () => {
    const repo = shopRepo();
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
  });

  it("names the linked ticket in the plain output", async () => {
    const repo = shopRepo();
    await create(repo, "shop/01");

    const result = await repo.run(["worktree", "list"]);

    expect(result.stdout).toMatch(/shop\/01-cart\s+shop\/01/);
  });
});

describe("dryland worktree prune", () => {
  async function resolved(repo: TempRepo, ticket = "shop/01"): Promise<void> {
    expect((await repo.run(["ticket", "resolve", ticket, "--answer", "Done."])).exitCode).toBe(0);
  }

  it("removes the worktree and its branch when every condition holds and --yes is given", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(path)).toBe(false);
    expect(repo.git("branch", "--list", "shop/01-cart")).toBe("");
    expect(repo.git("worktree", "list")).not.toContain("shop/01-cart");
  });

  it("also removes a branch whose commits are all merged", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    commitIn(path, "cart.txt", "Add cart");
    repo.git("merge", "--quiet", "--no-ff", "-m", "Merge cart", "shop/01-cart");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.exitCode).toBe(0);
    expect(repo.git("branch", "--list", "shop/01-cart")).toBe("");
  });

  it("does nothing without --yes and says so", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--yes");
    expect(result.stdout).toContain("Nothing was removed");
    expect(existsSync(path)).toBe(true);
    expect(repo.git("branch", "--list", "shop/01-cart")).toContain("shop/01-cart");
  });

  it("refuses while the ticket is unresolved", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("shop/01 is not resolved");
    expect(existsSync(path)).toBe(true);
  });

  it("refuses when the branch has unmerged commits", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    commitIn(path, "cart.txt", "Add cart");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unmerged commits");
    expect(repo.git("branch", "--list", "shop/01-cart")).toContain("shop/01-cart");
  });

  it("refuses when the worktree is dirty", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    writeFileSync(join(path, "notes.txt"), "wip\n");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("uncommitted changes");
    expect(existsSync(path)).toBe(true);
  });

  it("refuses while a session is attached", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    await resolved(repo);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes", "--session-attached"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("session is attached");
    expect(existsSync(path)).toBe(true);
  });

  it("names every failed condition at once", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    commitIn(path, "cart.txt", "Add cart");
    writeFileSync(join(path, "notes.txt"), "wip\n");

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"]);

    expect(result.stderr).toContain("not resolved");
    expect(result.stderr).toContain("unmerged commits");
    expect(result.stderr).toContain("uncommitted changes");
  });

  it("prunes a scratch worktree, which has no ticket to resolve", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "--map", "shop", "--slug", "spike");

    const result = await repo.run(["worktree", "prune", "shop/scratch-spike", "--yes"]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(path)).toBe(false);
  });

  it("refuses a branch dryland cannot tie to a ticket", async () => {
    const repo = shopRepo();
    const path = repo.addWorktree("feature/other");

    const result = await repo.run(["worktree", "prune", "feature/other", "--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not linked");
    expect(existsSync(path)).toBe(true);
  });
});

describe("dryland worktree prune and Copilot's trusted folders", () => {
  it("takes the pruned worktree off trustedFolders and touches nothing else in the config", async () => {
    const repo = shopRepo();
    const { path } = await create(repo, "shop/01");
    expect((await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."])).exitCode).toBe(0);
    const home = tempDir("dryland-copilot-home-");
    const config = `{\n  "theme": "dark",\n  "trustedFolders": [\n    "/other",\n    ${JSON.stringify(path)}\n  ]\n}\n`;
    writeFileSync(join(home, "config.json"), config);

    const result = await repo.run(["worktree", "prune", "shop/01-cart", "--yes"], repo.path, { COPILOT_HOME: home });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(home, "config.json"), "utf8")).toBe(config.replace(`,\n    ${JSON.stringify(path)}`, ""));
  });
});
