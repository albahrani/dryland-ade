import { describe, expect, it } from "vitest";
import {
  CLAUDE_CODE,
  currentAgentSession,
  parseSessionIndex,
  resumeArgs,
  type SessionIndex,
  sessionIdArgs,
  withSession,
} from "../src/index.ts";

const NOW = new Date("2026-10-16T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000).toISOString();

describe("withSession", () => {
  it("puts a new session first", () => {
    const index: SessionIndex = {
      items: { "shop/01": [{ adapter: "claude-code", sessionId: "a", lastSeen: daysAgo(1) }] },
    };

    const updated = withSession(index, "shop/01", { adapter: "claude-code", sessionId: "b" }, NOW);

    expect(updated.items["shop/01"]?.map((s) => s.sessionId)).toEqual(["b", "a"]);
    expect(updated.items["shop/01"]?.[0]?.lastSeen).toBe(NOW.toISOString());
  });

  it("moves a known session to the front, keeping its last state and never duplicating it", () => {
    const index: SessionIndex = {
      items: {
        "shop/01": [
          { adapter: "claude-code", sessionId: "b", lastSeen: daysAgo(1) },
          { adapter: "claude-code", sessionId: "a", lastSeen: daysAgo(2), lastState: "waiting" },
        ],
      },
    };

    const updated = withSession(index, "shop/01", { adapter: "claude-code", sessionId: "a" }, NOW);

    expect(updated.items["shop/01"]).toEqual([
      { adapter: "claude-code", sessionId: "a", lastSeen: NOW.toISOString(), lastState: "waiting" },
      { adapter: "claude-code", sessionId: "b", lastSeen: daysAgo(1) },
    ]);
  });

  it("tells sessions of different CLIs apart even when their ids match", () => {
    const index: SessionIndex = {
      items: { "shop/01": [{ adapter: "copilot", sessionId: "a", lastSeen: daysAgo(1) }] },
    };

    const updated = withSession(index, "shop/01", { adapter: "claude-code", sessionId: "a" }, NOW);

    expect(updated.items["shop/01"]?.map((s) => s.adapter)).toEqual(["claude-code", "copilot"]);
  });

  it("drops sessions past the retention period and the items they leave empty", () => {
    const index: SessionIndex = {
      items: {
        "shop/01": [{ adapter: "claude-code", sessionId: "old", lastSeen: daysAgo(8) }],
        "shop/02": [{ adapter: "claude-code", sessionId: "kept", lastSeen: daysAgo(6) }],
      },
    };

    const updated = withSession(index, "shop/03", { adapter: "claude-code", sessionId: "new" }, NOW, 7);

    expect(Object.keys(updated.items).sort()).toEqual(["shop/02", "shop/03"]);
  });

  it("sets the last state when one is given, and keeps the old one when none is", () => {
    const index: SessionIndex = {
      items: { "shop/01": [{ adapter: "claude-code", sessionId: "a", lastSeen: daysAgo(1), lastState: "running" }] },
    };

    const waiting = withSession(
      index,
      "shop/01",
      { adapter: "claude-code", sessionId: "a", lastState: "waiting" },
      NOW,
    );
    const unchanged = withSession(waiting, "shop/01", { adapter: "claude-code", sessionId: "a" }, NOW);

    expect(waiting.items["shop/01"]?.[0]?.lastState).toBe("waiting");
    expect(unchanged.items["shop/01"]).toEqual([
      { adapter: "claude-code", sessionId: "a", lastSeen: NOW.toISOString(), lastState: "waiting" },
    ]);
  });
});

describe("session launch and resume arguments", () => {
  it("give Claude Code its session id at launch and resume by id or through its picker", () => {
    expect(sessionIdArgs(CLAUDE_CODE, "abc")).toEqual(["--session-id", "abc"]);
    expect(resumeArgs(CLAUDE_CODE, "abc")).toEqual(["--resume", "abc"]);
    expect(resumeArgs(CLAUDE_CODE, null)).toEqual(["--resume"]);
  });

  it("are empty, or absent, for a CLI that has neither flag", () => {
    const plain = { ...CLAUDE_CODE, sessionIdFlag: null, resumeFlag: null };

    expect(sessionIdArgs(plain, "abc")).toEqual([]);
    expect(resumeArgs(plain, "abc")).toBeNull();
  });
});

describe("parseSessionIndex", () => {
  it("reads what withSession wrote", () => {
    const index = withSession({ items: {} }, "shop/01", { adapter: "claude-code", sessionId: "a" }, NOW);

    expect(parseSessionIndex(JSON.stringify(index))).toEqual(index);
  });

  it("is null for text that is not an index", () => {
    expect(parseSessionIndex("{ not json")).toBeNull();
    expect(parseSessionIndex("[]")).toBeNull();
    expect(parseSessionIndex("null")).toBeNull();
    expect(parseSessionIndex('{"items": []}')).toBeNull();
  });

  it("drops malformed sessions and the items they leave empty", () => {
    const text = JSON.stringify({
      items: {
        "shop/01": [
          { adapter: "claude-code", sessionId: "ok", lastSeen: NOW.toISOString() },
          { adapter: "claude-code", sessionId: "bad-date", lastSeen: "yesterday" },
          { adapter: "claude-code", sessionId: "bad-state", lastSeen: NOW.toISOString(), lastState: "ended" },
          "junk",
        ],
        "shop/02": "junk",
      },
    });

    expect(parseSessionIndex(text)).toEqual({
      items: { "shop/01": [{ adapter: "claude-code", sessionId: "ok", lastSeen: NOW.toISOString() }] },
    });
  });
});

describe("currentAgentSession", () => {
  it("is the session in an adapter's session variable", () => {
    expect(currentAgentSession([CLAUDE_CODE], { CLAUDE_CODE_SESSION_ID: "abc" })).toEqual({
      adapter: "claude-code",
      sessionId: "abc",
    });
  });

  it("is null without one, or with an empty one", () => {
    expect(currentAgentSession([CLAUDE_CODE], {})).toBeNull();
    expect(currentAgentSession([CLAUDE_CODE], { CLAUDE_CODE_SESSION_ID: " " })).toBeNull();
    expect(currentAgentSession([{ ...CLAUDE_CODE, sessionEnv: null }], { CLAUDE_CODE_SESSION_ID: "abc" })).toBeNull();
  });
});
