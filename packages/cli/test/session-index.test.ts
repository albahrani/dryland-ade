import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";
const TICKET = "# Build the cart\n\nType: task\nStatus: ready-for-agent\n\nCarts live on the server.\n";

function shopRepo(): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
    ".scratch/shop/map.md": "# Map: Shop\n",
    ".scratch/shop/issues/01-cart.md": TICKET,
    ".scratch/shop/issues/02-checkout.md": TICKET.replace("Build the cart", "Build checkout"),
  });
}

const indexPath = (repo: TempRepo) => join(repo.path, ".git", "dryland", "sessions.json");
const inSession = (id: string) => ({ CLAUDE_CODE_SESSION_ID: id });

async function sessionsOf(repo: TempRepo, ticket: string, cwd = repo.path) {
  const shown = await repo.run(["ticket", "show", ticket, "--json"], cwd);
  expect(shown.exitCode).toBe(0);
  return (JSON.parse(shown.stdout) as { sessions: { adapter: string; sessionId: string; lastSeen: string }[] })
    .sessions;
}

describe("the session index", () => {
  it("records the session a claim runs in, and ticket show lists it", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "claim", "shop/01"], repo.path, inSession("abc-123"));

    expect(result.exitCode).toBe(0);
    const sessions = await sessionsOf(repo, "shop/01");
    expect(sessions).toEqual([{ adapter: "claude-code", sessionId: "abc-123", lastSeen: expect.any(String) }]);
    const text = await repo.run(["ticket", "show", "shop/01"]);
    expect(text.stdout).toContain("Sessions (1):");
    expect(text.stdout).toContain("claude-code  abc-123  last seen");
  });

  it("is one file from the main checkout and from a linked worktree, and git never sees it", async () => {
    const repo = shopRepo();
    const worktree = repo.addWorktree("shop/01-cart");

    await repo.run(["ticket", "claim", "shop/01"], worktree, inSession("from-worktree"));
    await repo.run(["ticket", "comment", "shop/01", "--text", "Started."], repo.path, inSession("from-main"));

    expect(existsSync(indexPath(repo))).toBe(true);
    const ids = (await sessionsOf(repo, "shop/01", worktree)).map((s) => s.sessionId);
    expect(ids).toEqual(["from-main", "from-worktree"]);
    expect(await sessionsOf(repo, "shop/01")).toEqual(await sessionsOf(repo, "shop/01", worktree));
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("writes nothing for a command run outside an Agent CLI session", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(indexPath(repo))).toBe(false);
    expect(await sessionsOf(repo, "shop/01")).toEqual([]);
  });

  it("is written by every mutating ticket command, but not by ticket create", async () => {
    const repo = shopRepo();
    const commands = [
      // Triage refuses a claimed ticket, so it comes first.
      ["ticket", "triage", "shop/01", "--role", "ready-for-human"],
      ["ticket", "claim", "shop/01"],
      ["ticket", "block", "shop/01", "--add", "02"],
      ["ticket", "comment", "shop/01", "--text", "Hi."],
      ["ticket", "release", "shop/01"],
      ["ticket", "resolve", "shop/01", "--answer", "Done."],
    ];

    for (const [i, args] of commands.entries()) {
      expect((await repo.run(args, repo.path, inSession(`s${i}`))).exitCode).toBe(0);
    }
    const created = await repo.run(
      ["ticket", "create", "--map", "shop", "--title", "Ship it", "--type", "task"],
      repo.path,
      inSession("creator"),
    );

    expect(created.exitCode).toBe(0);
    expect((await sessionsOf(repo, "shop/01")).map((s) => s.sessionId)).toEqual(["s5", "s4", "s3", "s2", "s1", "s0"]);
    expect(await sessionsOf(repo, "shop/03")).toEqual([]);
  });

  it("updates last seen for a session recorded twice, without a duplicate", async () => {
    const repo = shopRepo();
    await repo.run(["ticket", "claim", "shop/01"], repo.path, inSession("same"));
    const [first] = await sessionsOf(repo, "shop/01");
    await repo.run(["ticket", "comment", "shop/01", "--text", "Other."], repo.path, inSession("other"));
    await new Promise((resolve) => setTimeout(resolve, 5));

    await repo.run(["ticket", "comment", "shop/01", "--text", "Again."], repo.path, inSession("same"));

    const sessions = await sessionsOf(repo, "shop/01");
    expect(sessions.map((s) => s.sessionId)).toEqual(["same", "other"]);
    expect(Date.parse(sessions[0]?.lastSeen ?? "")).toBeGreaterThan(Date.parse(first?.lastSeen ?? ""));
  });

  it("loses no entry when parallel dryland processes record different sessions", async () => {
    const repo = shopRepo();
    const ids = Array.from({ length: 8 }, (_, i) => `parallel-${i}`);

    const results = await Promise.all(
      ids.map((id) =>
        repo.run(["ticket", "comment", "shop/02", "--text", id, "--no-commit"], repo.path, inSession(id)),
      ),
    );

    expect(results.map((r) => r.exitCode)).toEqual(ids.map(() => 0));
    expect((await sessionsOf(repo, "shop/02")).map((s) => s.sessionId).sort()).toEqual([...ids].sort());
  });

  it("drops sessions older than the retention period, and items left empty, on the next write", async () => {
    const repo = shopRepo();
    const old = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
    const recent = new Date(Date.now() - 29 * 24 * 60 * 60_000).toISOString();
    mkdirSync(join(repo.path, ".git", "dryland"), { recursive: true });
    writeFileSync(
      indexPath(repo),
      JSON.stringify({
        items: {
          "shop/01": [
            { adapter: "claude-code", sessionId: "recent", lastSeen: recent },
            { adapter: "claude-code", sessionId: "old", lastSeen: old },
          ],
          "shop/02": [{ adapter: "claude-code", sessionId: "old-too", lastSeen: old }],
        },
      }),
    );

    await repo.run(["ticket", "claim", "shop/01"], repo.path, inSession("new"));

    expect((await sessionsOf(repo, "shop/01")).map((s) => s.sessionId)).toEqual(["new", "recent"]);
    const stored = JSON.parse(readFileSync(indexPath(repo), "utf8")) as { items: Record<string, unknown> };
    expect(Object.keys(stored.items)).toEqual(["shop/01"]);
  });

  it("reads an unparseable index as empty with a warning, and the next write replaces it", async () => {
    const repo = shopRepo();
    mkdirSync(join(repo.path, ".git", "dryland"), { recursive: true });
    writeFileSync(indexPath(repo), "{ not json");

    const shown = await repo.run(["ticket", "show", "shop/01", "--json"]);

    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout).sessions).toEqual([]);
    expect(shown.stderr).toContain("not valid");

    const claimed = await repo.run(["ticket", "claim", "shop/01"], repo.path, inSession("fresh"));

    expect(claimed.exitCode).toBe(0);
    expect((await sessionsOf(repo, "shop/01")).map((s) => s.sessionId)).toEqual(["fresh"]);
    expect((await repo.run(["ticket", "show", "shop/01"])).stderr).toBe("");
  });

  it("reads a missing index as empty, without a warning", async () => {
    const repo = shopRepo();

    const shown = await repo.run(["ticket", "show", "shop/01"]);

    expect(shown.exitCode).toBe(0);
    expect(shown.stderr).toBe("");
    expect(shown.stdout).not.toContain("Sessions");
  });
});
