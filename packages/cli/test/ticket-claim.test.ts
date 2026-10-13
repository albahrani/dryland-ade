import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";
const TICKET = "# Build the cart\n\nType: task\nStatus: ready-for-agent\nBlocked by: 02\n\nCarts live on the server.\n";
const TICKET_PATH = ".scratch/shop/issues/01-cart.md";

function shopRepo(files: Record<string, string> = {}): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
    [TICKET_PATH]: TICKET,
    ...files,
  });
}

describe("dryland ticket claim", () => {
  it("marks the ticket claimed for the holder and commits it", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "claim", "shop/01"], repo.path, { DRYLAND_SESSION_ID: "session-a" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("shop/01");
    expect(result.stdout).toContain("session-a");
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown).toMatchObject({ state: "claimed", claimant: "session-a" });
    expect(repo.git("status", "--porcelain")).toBe("");
    expect(repo.log()[0]).toBe("Claim shop/01 for session-a");
  });
});

describe("dryland ticket release", () => {
  it("restores the file exactly as it was before the claim and commits", async () => {
    const repo = shopRepo();
    await repo.run(["ticket", "claim", "shop/01"], repo.path, { DRYLAND_SESSION_ID: "session-a" });

    const claimed = repo.read(TICKET_PATH);
    expect(claimed).toContain("Status: claimed");
    expect(claimed).toContain("Carts live on the server.");

    const result = await repo.run(["ticket", "release", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).toBe(TICKET);
    expect(repo.log()[0]).toBe("Release claim on shop/01");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("says so when a claim made by hand had no recorded status to restore", async () => {
    const repo = shopRepo({ [TICKET_PATH]: TICKET.replace("Status: ready-for-agent", "Status: claimed") });

    const result = await repo.run(["ticket", "release", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("no previous status");
    expect(repo.read(TICKET_PATH)).not.toContain("Status:");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("fails clearly on a ticket that is not claimed", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "release", "shop/01"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not claimed");
    expect(repo.read(TICKET_PATH)).toBe(TICKET);
  });
});

describe("dryland ticket claim under contention and from worktrees", () => {
  it("lets exactly one of several parallel claims win and tells the losers who holds it", async () => {
    const repo = shopRepo();
    const holders = Array.from({ length: 8 }, (_, i) => `session-${i}`);

    const results = await Promise.all(
      holders.map((holder) => repo.run(["ticket", "claim", "shop/01"], repo.path, { DRYLAND_SESSION_ID: holder })),
    );

    const winners = holders.filter((_, i) => results[i]?.exitCode === 0);
    expect(winners).toHaveLength(1);
    const [winner] = winners;
    for (const result of results.filter((r) => r.exitCode !== 0)) {
      expect(result.stderr).toContain(`already claimed by ${winner}`);
    }
    expect(repo.log().filter((subject) => subject.startsWith("Claim "))).toEqual([`Claim shop/01 for ${winner}`]);
  });

  it("changes the ticket in the main checkout when claimed from a linked worktree, held by that branch", async () => {
    const repo = shopRepo();
    const worktree = repo.addWorktree("shop/01-cart");

    const result = await repo.run(["ticket", "claim", "shop/01"], worktree);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).toContain("Status: claimed");
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown.claimant).toBe("shop/01-cart");
    expect(repo.git("log", "-1", "--format=%s")).toBe("Claim shop/01 for shop/01-cart");
  });
});

describe("dryland ticket claim commits", () => {
  it("commits only the ticket file, leaving dirty and staged files alone", async () => {
    const repo = shopRepo({ "notes.md": "one\n", "other.md": "one\n" });
    repo.write("notes.md", "two\n");
    repo.write("other.md", "two\n");
    repo.git("add", "other.md");
    repo.write("untracked.md", "new\n");

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(repo.git("show", "--name-only", "--format=", "HEAD")).toBe(TICKET_PATH);
    // repo.git() trims its output, which eats the leading space of the first status line.
    const status = repo
      .git("status", "--porcelain")
      .split("\n")
      .map((line) => line.trim());
    expect(status.sort()).toEqual(["?? untracked.md", "M  other.md", "M notes.md"]);
  });

  it("changes the file but makes no commit with --no-commit", async () => {
    const repo = shopRepo();
    const before = repo.git("rev-parse", "HEAD");

    const result = await repo.run(["ticket", "claim", "shop/01", "--no-commit"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).toContain("Status: claimed");
    expect(repo.git("rev-parse", "HEAD")).toBe(before);
  });

  it("changes the file but makes no commit when git's dryland.autoCommit is false", async () => {
    const repo = shopRepo();
    repo.git("config", "dryland.autoCommit", "false");
    const before = repo.git("rev-parse", "HEAD");

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).toContain("Status: claimed");
    expect(repo.git("rev-parse", "HEAD")).toBe(before);
  });

  it("keeps the change on disk, warns and says what to do when the commit fails", async () => {
    const repo = shopRepo();
    repo.write(".git/hooks/pre-commit", "#!/bin/sh\necho blocked by hook >&2\nexit 1\n");

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).toContain("Status: claimed");
    expect(result.stderr).toContain("warning");
    expect(result.stderr).toContain("not committed");
    expect(result.stderr).toContain("git -C");
  });

  it("warns when the main checkout is not on the default branch", async () => {
    const repo = shopRepo();
    repo.git("switch", "--quiet", "-c", "feature");

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("not the default branch main");
  });
});

describe("dryland tracker write edge cases", () => {
  it("takes the default branch from init.defaultBranch when no origin or main/master exists", async () => {
    const repo = shopRepo();
    repo.git("branch", "-m", "main", "trunk");
    repo.git("config", "init.defaultBranch", "trunk");
    repo.git("switch", "--quiet", "-c", "feature");

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("not the default branch trunk");
  });

  it("removes a temp file a crashed write left in the issues directory", async () => {
    const repo = shopRepo();
    const leftover = ".scratch/shop/issues/.0b3c1f6e-8a52-4c1b-9a43-6f2d5f7d1e90.tmp";
    repo.write(leftover, "half a ticket");

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(repo.path, leftover))).toBe(false);
  });
});

describe("dryland tracker lock", () => {
  it("is not held forever by a crashed process", async () => {
    const repo = shopRepo();
    const dead = spawnSync(process.execPath, ["-e", ""]);
    const lockDir = join(repo.path, ".git", "dryland");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "tracker.lock"), JSON.stringify({ pid: dead.pid, token: "crashed", at: Date.now() }));

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).toContain("Status: claimed");
  });

  it("is not held forever by a corrupt lock file", async () => {
    const repo = shopRepo();
    const lockDir = join(repo.path, ".git", "dryland");
    mkdirSync(lockDir, { recursive: true });
    const lock = join(lockDir, "tracker.lock");
    writeFileSync(lock, "");
    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(lock, longAgo, longAgo);

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).toContain("Status: claimed");
  });
});
