import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claudeHistoryDir,
  claudeProjectSlug,
  createWorktree,
  nodeProcessRunner,
  reconcileIndex,
  reconcileSessionIndex,
  type SessionIndex,
  sessionIndexPath,
} from "../src/index.ts";

const NOW = new Date("2026-10-18T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const none = { dropped: new Set<string>(), claudeHistory: {} };

describe("claudeProjectSlug", () => {
  it("turns every character that is not a letter or digit into a dash, on Windows paths", () => {
    // The folder name Claude Code made for this very project.
    expect(claudeProjectSlug("T:\\Development\\mattpocock-ide")).toBe("T--Development-mattpocock-ide");
    // The folder Claude Code made for a worktree of this project, recorded in the research.
    expect(claudeProjectSlug("T:\\Development\\mattpocock-ide-worktrees\\hook-verify")).toBe(
      "T--Development-mattpocock-ide-worktrees-hook-verify",
    );
    expect(claudeProjectSlug("C:\\Users\\dev\\my repo.worktrees\\shop-01")).toBe(
      "C--Users-dev-my-repo-worktrees-shop-01",
    );
  });

  it("does the same to POSIX paths", () => {
    expect(claudeProjectSlug("/home/dev/shop.worktrees/shop-01-cart")).toBe("-home-dev-shop-worktrees-shop-01-cart");
    expect(claudeProjectSlug("/Users/dev/Projects/shop_app")).toBe("-Users-dev-Projects-shop-app");
  });

  it("is null past 200 characters, where Claude Code adds a hash that is not documented", () => {
    expect(claudeProjectSlug(`/${"a".repeat(200)}`)).toBeNull();
    expect(claudeProjectSlug(`/${"a".repeat(199)}`)).toHaveLength(200);
  });
});

describe("claudeHistoryDir", () => {
  it("is under ~/.claude/projects, or the configured root", () => {
    expect(claudeHistoryDir({}, "/home/dev", "/work/shop")).toBe(
      join("/home/dev", ".claude", "projects", "-work-shop"),
    );
    expect(claudeHistoryDir({ CLAUDE_CONFIG_DIR: "/cfg" }, "/home/dev", "/work/shop")).toBe(
      join("/cfg", "projects", "-work-shop"),
    );
  });
});

describe("reconcileIndex", () => {
  const known = (sessionId: string, lastSeen: Date, extra = {}) => ({
    adapter: "claude-code",
    sessionId,
    lastSeen: lastSeen.toISOString(),
    ...extra,
  });

  it("adds a history file the index lacks as found, with its modification time and no last state", () => {
    const index: SessionIndex = { items: { "shop/01": [known("a", minutesAgo(60 * 24), { lastState: "idle" })] } };

    const result = reconcileIndex(
      index,
      {
        ...none,
        claudeHistory: {
          "shop/01": [
            { sessionId: "a", modified: minutesAgo(60 * 24) },
            { sessionId: "by-hand", modified: minutesAgo(5) },
          ],
        },
      },
      NOW,
    );

    expect(result.items["shop/01"]).toEqual([
      { adapter: "claude-code", sessionId: "by-hand", lastSeen: minutesAgo(5).toISOString(), found: true },
      known("a", minutesAgo(60 * 24), { lastState: "idle" }),
    ]);
  });

  it("starts an item for a worktree the index knows nothing of", () => {
    const result = reconcileIndex(
      { items: {} },
      { ...none, claudeHistory: { "shop/01": [{ sessionId: "x", modified: minutesAgo(1) }] } },
      NOW,
    );

    expect(Object.keys(result.items)).toEqual(["shop/01"]);
  });

  it("removes dropped items whole", () => {
    const index: SessionIndex = {
      items: { "shop/01": [known("a", minutesAgo(1))], "shop/02": [known("b", minutesAgo(1))] },
    };

    const result = reconcileIndex(index, { ...none, dropped: new Set(["shop/01"]) }, NOW);

    expect(Object.keys(result.items)).toEqual(["shop/02"]);
  });

  it("removes a Claude Code session whose history file is gone, and the item it leaves empty", () => {
    const index: SessionIndex = { items: { "shop/01": [known("gone", minutesAgo(60))] } };

    const result = reconcileIndex(index, { ...none, claudeHistory: { "shop/01": [] } }, NOW);

    expect(result.items).toEqual({});
  });

  it("keeps a session recorded a moment ago, before its CLI wrote any history", () => {
    const index: SessionIndex = { items: { "shop/01": [known("fresh", minutesAgo(1))] } };

    expect(reconcileIndex(index, { ...none, claudeHistory: { "shop/01": [] } }, NOW)).toBe(index);
  });

  it("leaves other CLIs' sessions alone", () => {
    const index: SessionIndex = {
      items: { "shop/01": [{ adapter: "copilot", sessionId: "c", lastSeen: minutesAgo(600).toISOString() }] },
    };

    expect(reconcileIndex(index, { ...none, claudeHistory: { "shop/01": [] } }, NOW)).toBe(index);
  });

  it("applies retention, so an old history file is not kept as found", () => {
    const old = new Date(NOW.getTime() - 40 * 24 * 60 * 60_000);

    const result = reconcileIndex(
      { items: {} },
      { ...none, claudeHistory: { "shop/01": [{ sessionId: "old", modified: old }] } },
      NOW,
    );

    expect(result.items).toEqual({});
  });

  it("returns the very index it was given when nothing changes", () => {
    const index: SessionIndex = { items: { "shop/01": [known("a", minutesAgo(30), { found: true })] } };

    const result = reconcileIndex(
      index,
      { ...none, claudeHistory: { "shop/01": [{ sessionId: "a", modified: minutesAgo(30) }] } },
      NOW,
    );

    expect(result).toBe(index);
  });
});

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\nBuild it.\n`;

function fixture() {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "dryland-reconcile-repo-")));
  const home = mkdtempSync(join(tmpdir(), "dryland-reconcile-home-"));
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\nNothing.\n",
    ".scratch/shop/issues/01-cart.md": ticket("Cart", "Type: task", "Status: claimed"),
    ".scratch/shop/issues/02-pay.md": ticket("Pay", "Type: task", "Status: claimed"),
    ".scratch/shop/issues/03-ship.md": ticket("Ship", "Type: task", "Status: ready-for-agent"),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  git("add", ".");
  git("commit", "-q", "-m", "Fixture");
  return { repo, home };
}

function writeHistory(home: string, worktree: string, sessionId: string, modified: Date): void {
  const dir = claudeHistoryDir({}, home, worktree);
  if (dir === null) throw new Error("no history dir");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sessionId}.jsonl`);
  writeFileSync(file, '{"type":"user"}\n');
  utimesSync(file, modified, modified);
}

const readIndex = async (repo: string) =>
  JSON.parse(readFileSync(await sessionIndexPath(nodeProcessRunner, repo), "utf8")) as SessionIndex;

describe("reconcileSessionIndex", () => {
  it("finds a session started by hand in a claimed ticket's worktree", async () => {
    const { repo, home } = fixture();
    const worktree = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });
    writeHistory(home, worktree.path, "by-hand", minutesAgo(3));

    const result = await reconcileSessionIndex(nodeProcessRunner, repo, { home, env: {}, now: NOW });

    expect(result.changed).toBe(true);
    expect((await readIndex(repo)).items["shop/01"]).toEqual([
      { adapter: "claude-code", sessionId: "by-hand", lastSeen: minutesAgo(3).toISOString(), found: true },
    ]);
  });

  it("finds a session in a scratch worktree under its map", async () => {
    const { repo, home } = fixture();
    const worktree = await createWorktree(nodeProcessRunner, repo, { map: "shop", slug: "wayfinder" });
    writeHistory(home, worktree.path, "map-session", minutesAgo(3));

    await reconcileSessionIndex(nodeProcessRunner, repo, { home, env: {}, now: NOW });

    expect((await readIndex(repo)).items["shop"]?.map((s) => s.sessionId)).toEqual(["map-session"]);
  });

  it("removes the entries of a resolved ticket and of a released claim", async () => {
    const { repo, home } = fixture();
    const { recordSession } = await import("../src/index.ts");
    await recordSession(nodeProcessRunner, repo, "shop/02", { adapter: "claude-code", sessionId: "x" }, { now: NOW });
    await recordSession(nodeProcessRunner, repo, "shop/03", { adapter: "claude-code", sessionId: "y" }, { now: NOW });
    writeFileSync(
      join(repo, ".scratch/shop/issues/02-pay.md"),
      ticket("Pay", "Type: task", "Status: resolved") + "\n## Answer\n\nDone.\n",
    );

    await reconcileSessionIndex(nodeProcessRunner, repo, { home, env: {}, now: NOW });

    expect(await readIndex(repo)).toEqual({ items: {} });
  });

  it("removes a Claude Code entry whose history file is gone", async () => {
    const { repo, home } = fixture();
    const { recordSession } = await import("../src/index.ts");
    const worktree = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });
    const old = new Date(NOW.getTime() - 3 * 60 * 60_000);
    await recordSession(
      nodeProcessRunner,
      repo,
      "shop/01",
      { adapter: "claude-code", sessionId: "gone" },
      { now: old },
    );
    writeHistory(home, worktree.path, "kept", minutesAgo(3));

    await reconcileSessionIndex(nodeProcessRunner, repo, { home, env: {}, now: NOW });

    expect((await readIndex(repo)).items["shop/01"]?.map((s) => s.sessionId)).toEqual(["kept"]);
  });

  it("does not write the index when nothing changed", async () => {
    const { repo, home } = fixture();
    const worktree = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });
    writeHistory(home, worktree.path, "by-hand", minutesAgo(3));
    await reconcileSessionIndex(nodeProcessRunner, repo, { home, env: {}, now: NOW });
    const path = await sessionIndexPath(nodeProcessRunner, repo);
    const before = statSync(path).mtimeMs;

    const again = await reconcileSessionIndex(nodeProcessRunner, repo, { home, env: {}, now: NOW });

    expect(again.changed).toBe(false);
    expect(statSync(path).mtimeMs).toBe(before);
  });

  it("writes no index at all for a repo with nothing to reconcile", async () => {
    const { repo, home } = fixture();

    const result = await reconcileSessionIndex(nodeProcessRunner, repo, { home, env: {}, now: NOW });

    expect(result.changed).toBe(false);
  });
});
